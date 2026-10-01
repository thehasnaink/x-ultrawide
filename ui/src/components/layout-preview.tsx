import { cn } from "@/lib/utils"
import type { ScrollMode } from "@/lib/settings"

// Block heights per column, as flex ratios (horizontal: columns fill the
// height) and in px (vertical: columns run past the bottom edge).
const COLUMNS = [
  { ratio: [3, 2], px: [30, 22, 26] },
  { ratio: [2, 3, 2], px: [20, 34, 18] },
  { ratio: [4, 3], px: [36, 24, 20] },
  { ratio: [2, 2, 3], px: [24, 28, 30] },
  { ratio: [3, 4], px: [28, 20, 32] },
  { ratio: [2, 3], px: [32, 26, 22] },
  { ratio: [3, 2, 2], px: [22, 30, 26] },
  { ratio: [2, 4], px: [34, 22, 28] },
]

// A tiny schematic of the feed: column width follows the card-width setting and
// the scroll bar sits where the real one will.
export function LayoutPreview({
  mode,
  cardWidth,
  dimmed,
}: {
  mode: ScrollMode
  cardWidth: number
  dimmed?: boolean
}) {
  const horizontal = mode === "horizontal"
  const colWidth = Math.round(cardWidth / 11)

  return (
    <div
      aria-hidden
      className={cn(
        "relative h-[76px] overflow-hidden rounded-lg border bg-background transition-opacity",
        dimmed && "opacity-45"
      )}
    >
      <div className="flex h-full gap-1.5 [mask-image:linear-gradient(to_right,#000_70%,transparent)] p-1.5">
        {COLUMNS.map((col, i) => (
          <div
            key={i}
            className={cn(
              "flex shrink-0 flex-col gap-1.5",
              horizontal && "pb-2"
            )}
            style={{ width: colWidth }}
          >
            {(horizontal ? col.ratio : col.px).map((v, j) => (
              <div
                key={j}
                className="rounded-[5px] bg-muted-foreground/15"
                style={horizontal ? { flex: v } : { height: v, flexShrink: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      {horizontal ? (
        <div className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full bg-muted-foreground/10">
          <div className="h-full w-2/5 rounded-full bg-muted-foreground/45" />
        </div>
      ) : (
        <div className="absolute inset-y-1.5 right-1 w-[3px] rounded-full bg-muted-foreground/10">
          <div className="h-2/5 w-full rounded-full bg-muted-foreground/45" />
        </div>
      )}
    </div>
  )
}
