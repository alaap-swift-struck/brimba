// The swappable MODEL seam. The agent loop talks to this interface only — switching
// providers is a one-line change in selectModel(), never a rewrite. Default: Claude
// (Anthropic Messages API, full tool use) WHEN an ANTHROPIC_API_KEY is set; otherwise
// Cloudflare Workers AI (which now ALSO does full tool use — the agent can answer AND
// act on Workers AI, no key needed). Workers AI is also the cheap inline path.

import type { Env } from "../env"
import { traceError } from "../../../../shared/workers/trace"

/** The agent's output budget per model turn — ONE constant for BOTH providers
 * (Claude + Workers AI), and the number BULK_IDS_LIMIT is DERIVED from, so the cap
 * the model is told is one it can physically write. Lives in shared/workers/limits
 * with the caps it governs; re-exported here because this is where it is spent. */
export { AGENT_MAX_TOKENS } from "../../../../shared/workers/limits"
import { AGENT_MAX_TOKENS } from "../../../../shared/workers/limits"

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  /** for role:"tool" — the tool call this result answers + the tool's name. */
  toolCallId?: string
  toolName?: string
  /** for role:"assistant" — the tool calls it made (so the adapter can rebuild the
   *  provider's tool_use blocks and pair them with the following tool results). */
  toolCalls?: ToolCall[]
}

/** A tool the model may call, described to it (JSON-schema input). */
export type ToolSpec = { name: string; description: string; schema: Record<string, unknown> }

/** One tool call the model decided to make. */
export type ToolCall = { id: string; name: string; input: Record<string, unknown> }

/** What one model turn cost, in tokens. `cacheRead` / `cacheWrite` are the two numbers
 *  that PROVE prompt caching is working: a breakpoint that is configured but silently
 *  MISSES bills the full prefix on every call while looking, from the source, exactly
 *  like a fix. So they are read off the response and logged, never assumed. */
export type TokenUsage = { input: number; output: number; cacheWrite: number; cacheRead: number }

/** The model's reply: free text and/or tool calls to run — plus what the turn cost,
 *  when the provider reports it (Claude does; Workers AI doesn't). */
export type ModelReply = { text: string; toolCalls: ToolCall[]; usage?: TokenUsage }

export interface Model {
  readonly name: string
  /** true if this provider can actually call tools (act); false = answers only. */
  readonly canActWithTools: boolean
  /** true if this provider can stream text deltas (implements stream()); when false
   *  callers fall back to complete() — the run still works, tokens just arrive at once. */
  readonly canStream: boolean
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply>
  /** Stream the turn: fire onText for each text delta as it arrives, and return the
   *  FULL reply (accumulated text + any tool calls) when the turn ends — same shape as
   *  complete(), so the loop treats a streamed turn identically once it finishes. */
  stream?(messages: ChatMessage[], tools: ToolSpec[], onText: (delta: string) => void): Promise<ModelReply>
}

/* --------------------------------- Claude --------------------------------- */

/** Which Claude models accept `output_config.effort`. The Sonnet-5 / Opus-4.7+ /
 * Fable family support it; older tiers (Haiku 4.5, Sonnet/Opus ≤4.6) 400 on it. We
 * match by family so a dated id (e.g. `claude-sonnet-5-20260930`) still resolves. A
 * new/unknown id is treated as NOT supporting it — the safe default (a missing knob
 * just costs a little more; an unsupported one is a hard 400). */
export function supportsEffort(model: string): boolean {
  return /claude-(sonnet-5|opus-4-(7|8)|fable|mythos)/.test(model)
}

/** Our internal ChatMessage[] → the Anthropic Messages array. This is the canonical
 *  wire shape and the ONE place it's built, so complete() and stream() can't drift:
 *   • system messages are pulled out separately (not here) — dropped from this list;
 *   • a role:"tool" result becomes a `tool_result` block on a USER message;
 *   • consecutive same-role messages are COALESCED into one message of content blocks
 *     (the API rejects two user or two assistant messages in a row) — so a multi-tool
 *     turn's results collapse into ONE user message of tool_result blocks, and a
 *     trailing text note (e.g. the failure wrap-up ask) rides that same user turn;
 *   • an assistant turn that made tool calls becomes one assistant message carrying its
 *     text block (if any) + a tool_use block per call;
 *   • empty-text turns are skipped (the API rejects an empty text block).
 *  Exported pure so a unit test can lock the coalescing without a network call. */
export function toAnthropicMessages(messages: ChatMessage[]): { role: string; content: unknown[] }[] {
  const msgs: { role: string; content: unknown[] }[] = []
  const push = (role: string, blocks: unknown[]) => {
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) last.content.push(...blocks)
    else msgs.push({ role, content: blocks })
  }
  for (const m of messages) {
    if (m.role === "system") continue
    if (m.role === "tool") {
      push("user", [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }])
    } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      const blocks: unknown[] = []
      if (m.content) blocks.push({ type: "text", text: m.content })
      for (const tc of m.toolCalls)
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })
      push("assistant", blocks)
    } else if (m.content) {
      push(m.role, [{ type: "text", text: m.content }])
    }
  }
  return msgs
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }

/** The `usage` object Claude returns on every turn (wire names). */
type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function toUsage(u: AnthropicUsage | undefined): TokenUsage | undefined {
  if (!u) return undefined
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  }
}

/** PROOF THE CACHE IS WORKING, not merely configured.
 *
 * A prompt cache fails silently by design: a byte of drift in the prefix and every call
 * bills full price while the source still reads like a fix. Nothing in the response is
 * an error, so nothing surfaces — which is exactly why the counters get logged instead
 * of trusted. Three states, each its own event so a reviewer can grep for one:
 *   • prompt_cache_hit   — cacheRead > 0. The prefix was served at 0.1x. This is the
 *                          steady state and the line that proves the fix is real.
 *   • prompt_cache_write — cold prefix, entry created at 1.25x. Expected on the first
 *                          call of a reply (or after a deploy changes SYSTEM/tools).
 *   • prompt_cache_miss  — neither. The breakpoint did nothing: the prefix drifted, or
 *                          fell under the model's minimum. THIS is the regression alarm.
 *
 * It rides traceError (the one structured-log seam) for the same reason `timed`'s "slow"
 * event does — a JSON line filterable by `event` in Cloudflare's observability, rather
 * than an unfilterable console string. One line per model turn: ~50k events/month at the
 * measured volume, about $0.03 against the ~$273/month the cache saves. */
function logCacheUsage(model: string, place: string, usage: TokenUsage | undefined): void {
  if (!usage) return
  const event =
    usage.cacheRead > 0 ? "prompt_cache_hit" : usage.cacheWrite > 0 ? "prompt_cache_write" : "prompt_cache_miss"
  traceError({
    worker: "data-ops",
    place,
    event,
    detail: `model=${model} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite} fresh=${usage.input} out=${usage.output}`,
  })
}

class ClaudeModel implements Model {
  readonly canActWithTools = true
  readonly canStream = true
  constructor(
    private apiKey: string,
    readonly name: string,
    /** Reasoning effort: low | medium | high | xhigh | max. "low" keeps the agent
     *  cheap (owner is on a tight budget) while staying tool-capable; raise it via
     *  the AGENT_EFFORT var when more capability is worth the extra token cost. */
    private effort: string = "low"
  ) {}

  /** The one request body both complete() and stream() send — same messages/tools/effort
   *  rules, only the `stream` flag differs. Keeps the two paths from drifting. */
  private buildBody(messages: ChatMessage[], tools: ToolSpec[], stream: boolean): Record<string, unknown> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
    return {
      model: this.name,
      // Tool turns must be able to EMIT a whole bulk call — the old 1024 cap
      // silently truncated mid-JSON (a promise the runtime cannot keep is worse
      // than a smaller one). AGENT_MAX_TOKENS is the one constant both providers
      // use, sized so a BULK_IDS_LIMIT id list physically fits.
      max_tokens: AGENT_MAX_TOKENS,
      // Effort controls reasoning depth + overall token spend (GA on the Sonnet-5 /
      // Opus-4.7+ family, no beta header). "low" = terse, consolidated tool calls —
      // the cheap setting. We leave `thinking` unset on purpose: those models run
      // adaptive thinking by default and keep it minimal at low effort, which also
      // keeps them willing to reach for tools. `effort` is sent ONLY to models that
      // support it — older tiers (e.g. Haiku 4.5) reject `output_config.effort` with
      // a 400, so swapping AGENT_MODEL to one of those must not carry it. (Never send
      // temperature/top_p or budget_tokens on the 4.7+ family — each is a 400. The
      // `cache_control` below is NOT one of those: it's a GA field on every current
      // Claude family, unrelated to the sampling knobs that 400.)
      ...(supportsEffort(this.name) ? { output_config: { effort: this.effort } } : {}),
      ...(stream ? { stream: true } : {}),
      // THE PROMPT CACHE BREAKPOINT — one marker, and it has to be exactly here.
      //
      // A Claude request renders in the order `tools` → `system` → `messages`, and the
      // cache is a PREFIX match. So a single breakpoint on the last system block caches
      // BOTH halves of the fixed prefix — all 31 tool schemas AND the system prompt — in
      // one entry. Marking the tools array too would only buy a second, nested entry for
      // content this one already covers.
      //
      // The rule that makes or breaks it: every byte BEFORE the marker must be identical
      // between calls, or the cache misses in silence and we pay full price believing we
      // don't. Both halves qualify, and that is not an accident:
      //   • the tools come from toolSpecs() → TOOL_CATALOG, a static array in a fixed
      //     order — the same bytes for every user, never filtered by rights;
      //   • the system string is agent.ts's SYSTEM module constant (glossary + the
      //     generated capability brief). No date, no team name, no user name, nothing
      //     interpolated per request — and replayable() keeps role:"system" out of the
      //     replayed history, so nothing can be appended to it mid-conversation.
      // Put anything volatile in either and this whole block quietly becomes a no-op.
      // logCacheUsage() is what catches that: it reads the counters off the response, so
      // a regression surfaces as a prompt_cache_miss line rather than a bigger bill.
      //
      // Worth ~$273/month at measured volumes: the prefix is ~6,200 tokens and was re-paid
      // at full input price on every one of up to 13 model calls per reply — 48% of a
      // worst-case run. Reads bill at 0.1x and writes at 1.25x, so it pays back on the
      // second call of any reply; the 5-minute TTL covers a multi-step reply comfortably,
      // and consecutive replies in one conversation hit it too. (Sonnet 5 won't cache a
      // prefix under ~1,024 tokens — it reports zeros rather than erroring, so the marker
      // is harmless on the much smaller import-planning prompt that shares this seam.)
      ...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
      messages: toAnthropicMessages(messages),
      ...(tools.length
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) }
        : {}),
    }
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }
  }

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(messages, tools, false)),
      signal: AbortSignal.timeout(120_000), // LAW R11: ceiling a hung model call (generous — a turn finishes well under this)
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`model_error: Claude returned ${res.status}. ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { content?: AnthropicBlock[]; usage?: AnthropicUsage }
    const usage = toUsage(data.usage)
    logCacheUsage(this.name, "model.claude.complete", usage)
    const blocks = data.content ?? []
    const text = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
    const toolCalls = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }))
    return { text, toolCalls, usage }
  }

  /** Stream the turn (POST with "stream": true) and parse the Messages SSE: a
   *  content_block_start opens a text or tool_use block at an index; content_block_delta
   *  carries text_delta (→ onText, appended to that block's text) or input_json_delta
   *  (the tool's input JSON, accumulated as a string per index). message_stop ends it;
   *  we then parse each tool block's collected JSON and return the FULL reply. Errors
   *  surface as the same typed model_error the loop already turns into a clean message. */
  async stream(
    messages: ChatMessage[],
    tools: ToolSpec[],
    onText: (delta: string) => void
  ): Promise<ModelReply> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(messages, tools, true)),
      signal: AbortSignal.timeout(120_000), // LAW R11: ceiling a hung stream (generous — a turn finishes well under this)
    })
    if (!res.ok || !res.body) {
      const detail = res.body ? await res.text().catch(() => "") : ""
      throw new Error(`model_error: Claude returned ${res.status}. ${detail.slice(0, 200)}`)
    }
    const reply = await parseAnthropicStream(res.body, onText)
    logCacheUsage(this.name, "model.claude.stream", reply.usage)
    return reply
  }
}

/** One tool_use block being assembled as its input_json_delta chunks arrive. */
type ToolBuild = { id: string; name: string; json: string }

/** Parse an Anthropic Messages SSE stream: fire onText for each text delta and return
 *  the full {text, toolCalls} once the stream ends. Exported so the test can feed it a
 *  hand-built ReadableStream (no network). */
export async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void
): Promise<ModelReply> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let usage: TokenUsage | undefined
  const tools = new Map<number, ToolBuild>() // block index → the tool_use being built

  const handle = (data: string): void => {
    if (data === "[DONE]") return
    let ev: {
      type?: string
      index?: number
      content_block?: { type?: string; id?: string; name?: string }
      delta?: { type?: string; text?: string; partial_json?: string }
      message?: { usage?: AnthropicUsage }
      usage?: AnthropicUsage
    }
    try {
      ev = JSON.parse(data)
    } catch {
      return // ignore a keep-alive / unparsable frame
    }
    // A streamed turn reports its cost in two places: message_start opens with the INPUT
    // counters (including the two cache ones — the proof the prefix was served, not
    // re-bought), and message_delta closes with the final output_tokens. Both are
    // optional here: a stream without them simply leaves usage undefined and logs nothing.
    if (ev.type === "message_start") usage = toUsage(ev.message?.usage) ?? usage
    else if (ev.type === "message_delta" && usage && ev.usage?.output_tokens !== undefined)
      usage.output = ev.usage.output_tokens
    else if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use")
      tools.set(ev.index ?? 0, {
        id: ev.content_block.id ?? "",
        name: ev.content_block.name ?? "",
        json: "",
      })
    else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      const d = ev.delta.text ?? ""
      if (d) {
        text += d
        onText(d)
      }
    } else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
      const b = tools.get(ev.index ?? 0)
      if (b) b.json += ev.delta.partial_json ?? ""
    }
  }

  // SSE frames are separated by a blank line; each `data:` line carries one JSON event.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split("\n"))
        if (line.startsWith("data:")) handle(line.slice(5).trim())
    }
  }

  const toolCalls = [...tools.values()].map((b) => {
    let input: Record<string, unknown> = {}
    if (b.json.trim()) {
      try {
        const parsed = JSON.parse(b.json)
        if (parsed && typeof parsed === "object") input = parsed as Record<string, unknown>
      } catch {
        /* a truncated/garbled tool input just runs empty — the door re-validates */
      }
    }
    return { id: b.id, name: b.name, input }
  })
  return { text, toolCalls, usage }
}

/* ------------------------------- Workers AI ------------------------------- */
// Tool-calling on Workers AI (env.AI.run). LEARNED LIVE (2026-06-28): models split
// into tool-format camps — llama-3.3 took a flat tools shape, but the strong models
// (llama-4-scout, mistral, gemma, kimi, gpt-oss) require the OpenAI-WRAPPED shape
// `{type:"function", function:{name,description,parameters}}` (a flat shape 400s with
// "tools[0].function required"). So we send WRAPPED (widest support) and parse BOTH
// response shapes: native `tool_calls:[{name,arguments(object)}]` OR wrapped
// `[{id,type,function:{name,arguments(JSON string)}}]` (also under `choices[].message`).
// The chat template also REJECTS a replayed assistant-tool-call + role:"tool" round-
// trip, so we FLATTEN tool history into plain messages (a result → a user message).
// Default: @cf/meta/llama-4-scout-17b-16e-instruct (fast; chats AND calls tools well).
// Docs: https://developers.cloudflare.com/workers-ai/function-calling/
type WorkersAiFn = { name?: string; arguments?: unknown }
type WorkersAiToolCall = { id?: string; name?: string; arguments?: unknown; function?: WorkersAiFn }
type WorkersAiReply = {
  response?: string
  tool_calls?: WorkersAiToolCall[]
  choices?: { message?: { content?: string; tool_calls?: WorkersAiToolCall[] } }[]
}

class WorkersAiModel implements Model {
  readonly canActWithTools = true
  // No stream() — callers fall back to complete(), so token deltas are absent but the
  // step_start/step_end events still flow around each tool the model runs.
  readonly canStream = false
  constructor(
    private ai: Ai,
    readonly name: string
  ) {}

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    // Workers AI reliably ACCEPTS a tool call on a turn (we pass `tools` + parse
    // `tool_calls` out of the reply), but its chat template REJECTS a replayed
    // assistant-tool-call + role:"tool" round-trip (verified live — the follow-up
    // turn threw). So we FLATTEN prior tool activity into plain messages: a tool
    // RESULT becomes a user message the model reads to answer; an empty tool-call
    // assistant turn is dropped. The model can still call a (further) tool on this
    // turn — only the HISTORY is flattened.
    const msgs = messages
      .map((m): { role: "system" | "user" | "assistant"; content: string } | null => {
        if (m.role === "tool")
          return { role: "user", content: `Result from ${m.toolName ?? "tool"}: ${m.content ?? ""}` }
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length)
          return m.content ? { role: "assistant", content: m.content } : null
        return { role: m.role as "system" | "user" | "assistant", content: m.content ?? "" }
      })
      .filter((m): m is { role: "system" | "user" | "assistant"; content: string } => m !== null)

    const body: Record<string, unknown> = { messages: msgs, max_tokens: AGENT_MAX_TOKENS, temperature: 0.3 }
    if (tools.length)
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.schema },
      }))

    let out: WorkersAiReply
    try {
      out = (await this.ai.run(this.name as keyof AiModels, body as never)) as WorkersAiReply
    } catch (e) {
      // Surface model/runtime errors as a typed error the loop turns into a clean
      // message, instead of an uncaught 500. Most common cause historically: a
      // deprecated/removed model id (this is what crashed the agent before).
      const detail = e instanceof Error ? e.message : String(e)
      throw new Error(`model_error: Workers AI (${this.name}) failed. ${detail.slice(0, 200)}`)
    }

    const choice = out.choices?.[0]?.message
    const text = out.response ?? choice?.content ?? ""
    const rawCalls = (Array.isArray(out.tool_calls) ? out.tool_calls : choice?.tool_calls) ?? []
    const toolCalls: ToolCall[] = rawCalls
      .map((c, i): ToolCall | null => {
        const fn = c.function ?? c // OpenAI-wrapped vs native/flat
        if (typeof fn.name !== "string") return null
        let args: unknown = fn.arguments
        if (typeof args === "string") {
          try {
            args = JSON.parse(args)
          } catch {
            args = {}
          }
        }
        return {
          id: c.id ?? `call_${i}`,
          name: fn.name,
          input: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
        }
      })
      .filter((c): c is ToolCall => c !== null)
    return { text, toolCalls }
  }
}

/* -------------------------------- selection -------------------------------- */

/** The agentic model: Claude when a key is set, else Workers AI — which now ALSO
 *  does full tool use (llama-3.3-70b-instruct-fp8-fast supports function calling).
 *  Swapping the brain is one edit here (or the WORKERS_AI_MODEL var). */
export function selectModel(env: Env): Model {
  if (env.ANTHROPIC_API_KEY)
    return new ClaudeModel(env.ANTHROPIC_API_KEY, env.AGENT_MODEL || "claude-sonnet-5", env.AGENT_EFFORT || "low")
  return new WorkersAiModel(env.AI, env.WORKERS_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct")
}

/** One cheap text completion (no tools) — used for inline jobs like the help-reply
 * first draft and classification. Always Workers AI (cheap), regardless of the key. */
export async function cheapText(env: Env, system: string, user: string): Promise<string> {
  const out = (await env.AI.run((env.WORKERS_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct") as keyof AiModels, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })) as { response?: string }
  return (out.response ?? "").trim()
}
