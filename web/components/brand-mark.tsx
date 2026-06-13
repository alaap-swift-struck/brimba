import { brand } from "@shared/brand"

// The app's logo lockup, from shared/brand.ts: the logo image if set, else a
// monogram on the accent colour (so it re-skins with the brand). Optionally
// shows the app name beside it. Used on the sign-in / onboarding screens.
export function BrandMark({
  showName = false,
  className = "",
}: {
  showName?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center overflow-hidden rounded-xl text-lg font-bold">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="size-full object-cover"
          />
        ) : (
          brand.name[0]?.toUpperCase()
        )}
      </span>
      {showName && (
        <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
      )}
    </div>
  )
}
