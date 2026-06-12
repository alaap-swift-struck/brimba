// The ONE pair of response helpers every worker uses — same JSON shape,
// same error contract (shared/types.ts ApiError), defined exactly once.

import type { ApiError } from "../types"

export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

export const fail = (
  status: number,
  error: string,
  message: string
): Response => json({ error, message } satisfies ApiError, status)
