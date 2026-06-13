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
