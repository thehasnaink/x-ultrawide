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

// storage.sync is rate limited (about two writes a second), so writing on every
// step of a slider drag made writes fail and the page stop following. Each change
// goes to storage.local at once (no limit; the page follows that live), and the
// synced copy is written once the changes pause.
let pending: Partial<Settings> = {}
let timer: ReturnType<typeof setTimeout> | undefined

function flush() {
  timer = undefined
  const patch = pending
  pending = {}
  if (Object.keys(patch).length) chrome.storage.sync.set(patch)
}

function save(patch: Partial<Settings>, all: Settings) {
  if (inExtension) {
    chrome.storage.local.set({ xsLive: all })
    pending = { ...pending, ...patch }
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 350)
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
    // only the synced copy: our own live writes must not bounce back mid-drag
    const onChanged = (_: unknown, area: string) => {
      if (area === "sync" && !timer) load().then((s) => alive && setSettings(s))
    }
    chrome.storage.onChanged.addListener(onChanged)
    // the popup can be closed mid-drag: do not lose the last value
    const onHide = () => {
      if (timer) {
        clearTimeout(timer)
        flush()
      }
    }
    window.addEventListener("pagehide", onHide)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChanged)
      window.removeEventListener("pagehide", onHide)
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch } // instant feedback
      save(patch, next)
      return next
    })
  }, [])

  return { settings, update }
}
