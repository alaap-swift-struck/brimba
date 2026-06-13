import { brand } from "@shared/brand"

// Injects the app's accent colours AND the screen background tone (from
// shared/brand.ts) as token overrides, so the whole UI library re-skins — and
// every screen re-tones — from one place. Uses higher specificity (html:root /
// html.dark) than the library defaults, so it wins no matter the stylesheet
// order, in both light and dark. Pure static <style> — no flash.
export function BrandTheme() {
  const { primary, secondary } = brand.accent
  const { screen } = brand
  const css = [
    `html:root{--primary:${primary.light};--ring:${primary.light};--accent:${secondary.light};--background:${screen.light}}`,
    `html.dark{--primary:${primary.dark};--ring:${primary.dark};--accent:${secondary.dark};--background:${screen.dark}}`,
  ].join("\n")
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
