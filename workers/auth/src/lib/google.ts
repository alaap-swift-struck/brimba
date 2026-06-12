// "Sign in with Google", spoken directly to Google — no Clerk, no middleman.
// Standard OAuth code flow with PKCE; the browser bounces Google -> us.

import type { Env } from "../env"
import { base64Url, randomToken, sha256Bytes } from "./crypto"

export const OAUTH_COOKIE = "brimba_oauth"

export function googleRedirectUri(env: Env): string {
  return `${env.APP_ORIGIN}/api/auth/google/callback`
}

/** Build Google's consent-screen URL + the short-lived state cookie. */
export async function buildGoogleStart(
  env: Env
): Promise<{ url: string; setCookie: string }> {
  const state = randomToken()
  const verifier = randomToken()
  const challenge = base64Url(await sha256Bytes(verifier))

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID)
  url.searchParams.set("redirect_uri", googleRedirectUri(env))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid email profile")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("prompt", "select_account")

  // 10-minute, HttpOnly: just enough to survive the round-trip to Google.
  const setCookie = `${OAUTH_COOKIE}=${state}.${verifier}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`
  return { url: url.toString(), setCookie }
}

export type GoogleIdentity = {
  sub: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
}

/**
 * Trade Google's one-time code for the user's identity. The id_token arrives
 * over our direct TLS call to Google's token endpoint, so decoding its payload
 * (without re-verifying the signature) is the standard, safe pattern here.
 */
export async function exchangeGoogleCode(
  env: Env,
  code: string,
  verifier: string
): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(env),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`)
  }
  const data = (await res.json()) as { id_token?: string }
  if (!data.id_token) throw new Error("Google returned no id_token")

  const payload = JSON.parse(
    atob(data.id_token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"))
  ) as {
    iss: string
    aud: string
    sub: string
    email?: string
    email_verified?: boolean
    given_name?: string
    family_name?: string
    picture?: string
  }

  if (!payload.iss.includes("accounts.google.com"))
    throw new Error("id_token not issued by Google")
  if (payload.aud !== env.GOOGLE_CLIENT_ID)
    throw new Error("id_token issued for a different app")
  if (!payload.email || payload.email_verified !== true)
    throw new Error("Google account has no verified email")

  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    firstName: payload.given_name ?? null,
    lastName: payload.family_name ?? null,
    imageUrl: payload.picture ?? null,
  }
}
