// The swappable MODEL seam. The agent loop talks to this interface only — switching
// providers is a one-line change in selectModel(), never a rewrite. Default: Claude
// (Anthropic Messages API, full tool use) WHEN an ANTHROPIC_API_KEY is set; otherwise
// Cloudflare Workers AI (which now ALSO does full tool use — the agent can answer AND
// act on Workers AI, no key needed). Workers AI is also the cheap inline path.

import type { Env } from "../env"

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

/** The model's reply: free text and/or tool calls to run. */
export type ModelReply = { text: string; toolCalls: ToolCall[] }

export interface Model {
  readonly name: string
  /** true if this provider can actually call tools (act); false = answers only. */
  readonly canActWithTools: boolean
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply>
}

/* --------------------------------- Claude --------------------------------- */

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }

class ClaudeModel implements Model {
  readonly canActWithTools = true
  constructor(
    private apiKey: string,
    readonly name: string
  ) {}

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
    const msgs = messages
      .filter((m) => m.role !== "system")
      .map((m): { role: string; content: unknown } => {
        if (m.role === "tool")
          return {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
          }
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
          const blocks: unknown[] = []
          if (m.content) blocks.push({ type: "text", text: m.content })
          for (const tc of m.toolCalls)
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })
          return { role: "assistant", content: blocks }
        }
        return { role: m.role, content: m.content }
      })

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.name,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages: msgs,
        ...(tools.length
          ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) }
          : {}),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`model_error: Claude returned ${res.status}. ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { content?: AnthropicBlock[] }
    const blocks = data.content ?? []
    const text = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
    const toolCalls = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }))
    return { text, toolCalls }
  }
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

    const body: Record<string, unknown> = { messages: msgs, max_tokens: 1024, temperature: 0.3 }
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
    return new ClaudeModel(env.ANTHROPIC_API_KEY, env.AGENT_MODEL || "claude-sonnet-4-6")
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
