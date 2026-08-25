// shared/brand.ts — THE one place to brand this app.
//
// Change these values and the whole APP re-skins everywhere: name, logo,
// motto, description, and the accent colours (primary + secondary). It's read
// by the web UI AND by communications (e.g. login emails) — so changing the
// name here updates it in the app and in emails, exactly like Glide.
//
// What it does NOT touch: the *visual theme* (accent colours + background)
// styles the app UI only — colours never bleed into emails or PDFs (those keep
// their own simple formatting; only the text identity flows into them).
//
// Reusing this base for a new app? Edit ONLY this file (and drop in a logo).

export type AccentPair = { light: string; dark: string } // oklch values

export const brand = {
  name: "Brimba",
  description: "The multi-tenant SaaS base by Swift Struck.",
  motto: "Your teams, your space.",

  /** App logo URL. null = show a monogram built from the name. */
  logoUrl: null as string | null,

  /** Accent colours — override the UI library's theme tokens (oklch, per mode).
   * Defaults reproduce the library's teal; change them to re-skin the app. */
  accent: {
    /** main brand colour: buttons, links, focus rings, the living light. */
    primary: {
      light: "oklch(0.58 0.1 185)",
      dark: "oklch(0.62 0.11 185)",
    } as AccentPair,
    /** soft tinted surfaces (subtle hovers, badges, highlights). */
    secondary: {
      light: "oklch(0.96 0.02 185)",
      dark: "oklch(0.3 0.04 185)",
    } as AccentPair,
  },

  /** Email-safe HEX mirror of the accent. Email clients don't support oklch, so
   * branded emails use these. Keep roughly in step with `accent` above.
   * primary = buttons/links · surface = soft tint panel · ink = text on surface. */
  accentHex: {
    primary: "#0e9e86",
    surface: "#e8f6f1",
    ink: "#0a5446",
  },

  /** Hex mirror of the DARK screen tone, for the one surface that cannot take
   * oklch: the PWA manifest's splash `background_color` (a single colour, not a
   * pair — the manifest has room for one). Keep it in step with `screen.dark`. */
  splashHex: "#0f1112",

  /** The screen background tone — the SINGLE source for the page surface behind
   * every screen (not the glass/menus on top). Softened off pure white / pure
   * black so no screen ever looks "super white" or "super dark"; the brand glow
   * + ambient light layer on top. Change these two values to re-tone every
   * screen in both modes at once (BrandTheme injects them as --background). */
  screen: {
    light: "oklch(0.975 0 0)",
    dark: "oklch(0.18 0 0)",
  } as AccentPair,
}

/** The name in SLUG form — lowercase, hyphenated.
 *
 * DERIVED, never a second source of truth: `scripts/fork.mjs` slugifies a new
 * product name with exactly this rule, so anything built from it (worker names,
 * the MCP server id) agrees with the fork sweep instead of drifting from it.
 * Read this rather than hardcoding the name a second time — "edit ONLY this
 * file" is a promise the rest of the app has to keep. */
export const brandSlug = brand.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
