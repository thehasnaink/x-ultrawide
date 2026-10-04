import { ArrowLeftRight, ArrowUpDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { LayoutPreview } from "@/components/layout-preview"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import icon from "@/assets/logo.png"
import { cn } from "@/lib/utils"
import { CARD_WIDTH, type ScrollMode, useSettings } from "@/lib/settings"

const MODE_HINT: Record<ScrollMode, string> = {
  horizontal: "Full-height columns, scroll sideways.",
  vertical: "Classic masonry, scroll up and down.",
}

export default function App() {
  const { settings, update } = useSettings()

  // The popup is tiny; render nothing for the few ms it takes storage to answer
  // rather than flashing the defaults.
  if (!settings) return <main className="h-[340px] w-[340px]" />

  const off = !settings.enabled

  return (
    <main className="flex w-[340px] flex-col">
      <header className="flex flex-col gap-3.5 border-b bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <img src={icon} alt="" className="size-9 shrink-0 rounded-[10px]" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-sm leading-none font-semibold">X Ultrawide</h1>
            <p className="flex items-center gap-1.5 text-xs leading-none text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  off ? "bg-muted-foreground/40" : "bg-emerald-500"
                )}
              />
              {off ? "Paused" : "Active on your Home feed"}
            </p>
          </div>
          <Switch
            className="ml-auto"
            checked={settings.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            aria-label="Enable X Ultrawide"
          />
        </div>
        <LayoutPreview
          mode={settings.scrollMode}
          cardWidth={settings.cardWidth}
          dimmed={off}
        />
      </header>

      <div className="flex flex-col gap-4 p-4">
        <FieldGroup
          className={cn(
            "transition-opacity",
            off && "pointer-events-none opacity-45"
          )}
          aria-disabled={off}
        >
          <Field>
            <FieldLabel>Scrolling</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              value={settings.scrollMode}
              onValueChange={(v) =>
                v && update({ scrollMode: v as ScrollMode })
              }
              disabled={off}
            >
              <ToggleGroupItem value="horizontal" className="flex-1">
                <ArrowLeftRight data-icon="inline-start" />
                Horizontal
              </ToggleGroupItem>
              <ToggleGroupItem value="vertical" className="flex-1">
                <ArrowUpDown data-icon="inline-start" />
                Vertical
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription className="text-xs">
              {MODE_HINT[settings.scrollMode]}
            </FieldDescription>
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="card-width">Card width</FieldLabel>
              <Badge variant="secondary" className="tabular-nums">
                {settings.cardWidth}px
              </Badge>
            </div>
            <Slider
              id="card-width"
              min={CARD_WIDTH.min}
              max={CARD_WIDTH.max}
              step={CARD_WIDTH.step}
              value={[settings.cardWidth]}
              onValueChange={([cardWidth]) => update({ cardWidth })}
              disabled={off}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="block-ads">Block ads</FieldLabel>
              <FieldDescription>
                Hide promoted and boosted posts.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="block-ads"
              checked={settings.blockAds}
              onCheckedChange={(blockAds) => update({ blockAds })}
              disabled={off}
            />
          </Field>
        </FieldGroup>

        <p className="text-center text-xs text-muted-foreground">
          Applies to your Home feed. Changes are instant.
        </p>

        <Separator />

        <p className="text-center text-xs text-muted-foreground">
          Follow{" "}
          <a
            href="https://x.com/TheHasnainK"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            @TheHasnainK
          </a>{" "}
          on X
        </p>
      </div>
    </main>
  )
}
