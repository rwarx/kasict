// Управление темой: белая / чёрная + автоматический сезонный акцент.
// Сезон определяется по текущему месяцу (можно предпросмотреть через ?season=winter|spring|summer|autumn).

import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

const THEME_KEY = 'schedule:theme'

export const SEASONS: Record<Season, { label: string; emoji: string; hint: string }> = {
  winter: { label: 'Зима', emoji: '❄️', hint: 'бело-голубая тема' },
  spring: { label: 'Весна', emoji: '🌸', hint: 'свежая зелёно-розовая тема' },
  summer: { label: 'Лето', emoji: '☀️', hint: 'жёлто-зелёная тема' },
  autumn: { label: 'Осень', emoji: '🍂', hint: 'жёлто-оранжевая тема' },
}

/** Сезон по месяцу (северное полушарие). */
export function seasonByMonth(date: Date = new Date()): Season {
  const m = date.getMonth() // 0–11
  if (m <= 1 || m === 11) return 'winter'   // декабрь–февраль
  if (m <= 4) return 'spring'               // март–май
  if (m <= 7) return 'summer'               // июнь–август
  return 'autumn'                           // сентябрь–ноябрь
}

/** Сезон с учётом предпросмотра через URL: ?season=winter|spring|summer|autumn */
export function currentSeason(date: Date = new Date()): Season {
  try {
    const v = new URLSearchParams(window.location.search).get('season')?.toLowerCase()
    if (v === 'winter' || v === 'spring' || v === 'summer' || v === 'autumn') return v
  } catch { /* ignore */ }
  return seasonByMonth(date)
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
    // Старое значение 'system' больше не используется — разрешаем один раз
    if (v === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function isDarkPref(p: ThemePref): boolean {
  return p === 'dark'
}

function apply(pref: ThemePref, season: Season): boolean {
  const dark = isDarkPref(pref)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.season = season
  root.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#0E0E12' : '#F4F4F1')
  return dark
}

export function useTheme(): {
  pref: ThemePref
  setPref: (p: ThemePref) => void
  isDark: boolean
  season: Season
} {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [season] = useState<Season>(() => currentSeason())
  const [isDark, setIsDark] = useState(() => apply(readPref(), currentSeason()))

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    try { localStorage.setItem(THEME_KEY, p) } catch { /* ignore */ }
    setIsDark(apply(p, season))
  }, [season])

  // Синхронизация между вкладками
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) {
        const next = readPref()
        setPrefState(next)
        setIsDark(apply(next, season))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [season])

  return { pref, setPref, isDark, season }
}
