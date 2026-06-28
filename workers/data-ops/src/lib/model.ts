// The swappable MODEL seam. The agent loop talks to this interface only — switching
// providers is a one-line change in selectModel(), never a rewrite. Default: Claude
// (Anthropic Messages API, full tool use) WHEN an ANTHROPIC_API_KEY is set; otherwise
// Cloudflare Workers AI (text-only — the agent can answer, but acting needs the key).
// Workers AI is also the cheap path for inline jobs (help drafts, classification).

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
// Tool-calling on Workers AI. Native wire format (env.AI.run):
//   request:  { messages, tools:[{name,description,parameters}], max_tokens, temperature }
//   response: { response: string, tool_calls?: [{ name, arguments(OBJECT) }] }
// Differences from Claude we normalise here:
//   • tools use `parameters` (not `input_schema`)
//   • tool_calls carry NO id and `arguments` is already an object — we mint ids
//     (call_0,1,…) so the rest of the loop (which is id-based) is provider-agnostic
//   • the round-trip: an assistant tool turn → content is the chosen tool as a JSON
//     string; the result → role:"tool" with a JSON-string content
// Docs: https://developers.cloudflare.com/workers-ai/function-calling/
type WorkersAiToolCall = { name?: string; arguments?: Record<string, unknown> }
type WorkersAiReply = { response?: string; tool_calls?: WorkersAiToolCall[] }

class WorkersAiModel implements Model {
  readonly canActWithTools = true
  constructor(
    private ai: Ai,
    readonly name: string
  ) {}

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    const msgs = messages.map((m) => {
      // role:"tool" → Workers AI tool message (the result of a call); content is a string.
      if (m.role === "tool") return { role: "tool" as const, content: m.content ?? "" }
      // assistant turn that MADE tool calls → encode the chosen call(s) as the content
      // string Workers AI expects on the assistant side (its own round-trip shape).
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
        const encoded = m.toolCalls.map((tc) => ({ name: tc.name, arguments: tc.input }))
        const body =
          (m.content ? m.content + "\n" : "") +
          (encoded.length === 1 ? JSON.stringify(encoded[0]) : JSON.stringify(encoded))
        return { role: "assistant" as const, content: body }
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content ?? "" }
    })

    const body: Record<string, unknown> = { messages: msgs, max_tokens: 1024, temperature: 0.3 }
    if (tools.length)
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.schema, // Workers AI calls it `parameters`, not `input_schema`
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

    const text = out.response ?? ""
    const raw = Array.isArray(out.tool_calls) ? out.tool_calls : []
    // Mint ids (Workers AI returns none); keep only well-formed calls.
    const toolCalls: ToolCall[] = raw
      .filter((c): c is WorkersAiToolCall & { name: string } => typeof c?.name === "string")
      .map((c, i) => ({
        id: `call_${i}`,
        name: c.name,
        input: c.arguments && typeof c.arguments === "object" ? c.arguments : {},
      }))
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
  return new WorkersAiModel(env.AI, env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast")
}

/** One cheap text completion (no tools) — used for inline jobs like the help-reply
 * first draft and classification. Always Workers AI (cheap), regardless of the key. */
export async function cheapText(env: Env, system: string, user: string): Promise<string> {
  const out = (await env.AI.run((env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast") as keyof AiModels, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })) as { response?: string }
  return (out.response ?? "").trim()
}
