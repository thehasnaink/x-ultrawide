import { useCallback, useEffect, useState } from "react"

export type ScrollMode = "horizontal" | "vertical"

export interface Settings {
  enabled: boolean
  scrollMode: ScrollMode
  cardWidth: number
  blockAds: boolean
}

export const DEFAULTS: Settings = {
  enabled: true,
  scrollMode: "horizontal",
  cardWidth: 520,
  blockAds: true,
}

export const CARD_WIDTH = { min: 320, max: 900, step: 10 } as const

const inExtension = typeof chrome !== "undefined" && !!chrome.storage?.sync

// Outside the extension (plain `vite dev` preview) fall back to localStorage so
// the popup is still fully interactive.
const LS_KEY = "xs-popup-preview"

function load(): Promise<Settings> {
  if (inExtension) {
    return new Promise((resolve) =>
      chrome.storage.sync.get(DEFAULTS as unknown as Record<string, unknown>, (s) =>
        resolve({ ...DEFAULTS, ...(s as Partial<Settings>) })
      )
    )
  }
  try {
    return Promise.resolve({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") })
  } catch {
    return Promise.resolve(DEFAULTS)
  }
}

function save(patch: Partial<Settings>) {
  if (inExtension) {
    chrome.storage.sync.set(patch)
    return
  }
  try {
    const next = { ...JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"), ...patch }
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* preview only */
  }
}

/** Settings, kept in sync with chrome.storage (changes made elsewhere show up live). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    let alive = true
    load().then((s) => alive && setSettings(s))
    if (!inExtension) return () => void (alive = false)
    const onChanged = () => load().then((s) => alive && setSettings(s))
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev)) // instant feedback
    save(patch)
  }, [])

  return { settings, update }
}
