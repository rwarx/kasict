// Управление темой: белая / чёрная + цветовой акцент.
// Акцент: 'auto' — сезонный по месяцу (предпросмотр через ?season=winter|spring|summer|autumn),
// 'brand' — фирменный фиолетовый колледжа, либо ручной выбор сезона.

import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type AccentPref = 'auto' | 'brand' | Season
/** Схема акцента, применённая к <html data-season>: сезон или брендовый фиолетовый. */
export type AccentScheme = Season | 'brand'

const THEME_KEY = 'schedule:theme'
const ACCENT_KEY = 'schedule:accent'

export const SEASONS: Record<Season, { label: string; emoji: string; hint: string }> = {
  winter: { label: 'Зима', emoji: '❄️', hint: 'бело-голубая тема' },
  spring: { label: 'Весна', emoji: '🌸', hint: 'свежая зелёно-розовая тема' },
  summer: { label: 'Лето', emoji: '☀️', hint: 'жёлто-зелёная тема' },
  autumn: { label: 'Осень', emoji: '🍂', hint: 'жёлто-оранжевая тема' },
}

/** Палитры переключателя акцента (цвет точки = светлая версия акцента). */
export const ACCENT_OPTIONS: { id: AccentPref; label: string; color: string }[] = [
  { id: 'auto', label: 'Авто', color: 'linear-gradient(135deg, #D97706 25%, #16A34A 50%, #0284C7 75%, #7403FC 100%)' },
  { id: 'brand', label: 'Фиолетовый', color: '#7403FC' },
  { id: 'winter', label: 'Зима', color: '#0284C7' },
  { id: 'spring', label: 'Весна', color: '#16A34A' },
  { id: 'summer', label: 'Лето', color: '#65A30D' },
  { id: 'autumn', label: 'Осень', color: '#D97706' },
]

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

function readAccentPref(): AccentPref {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    if (v === 'brand' || v === 'winter' || v === 'spring' || v === 'summer' || v === 'autumn' || v === 'auto') return v
  } catch { /* ignore */ }
  return 'auto'
}

function isDarkPref(p: ThemePref): boolean {
  return p === 'dark'
}

/** Итоговая схема акцента с учётом предпочтения. */
export function resolveAccent(pref: AccentPref, date: Date = new Date()): AccentScheme {
  if (pref === 'brand') return 'brand'
  if (pref !== 'auto') return pref
  return currentSeason(date)
}

function apply(pref: ThemePref, accent: AccentScheme): boolean {
  const dark = isDarkPref(pref)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.season = accent
  root.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#0E0E12' : '#F4F4F1')
  return dark
}

export function useTheme(): {
  pref: ThemePref
  setPref: (p: ThemePref) => void
  isDark: boolean
  season: AccentScheme
  accentPref: AccentPref
  setAccentPref: (p: AccentPref) => void
} {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [accentPref, setAccentPrefState] = useState<AccentPref>(readAccentPref)
  const [season, setSeason] = useState<AccentScheme>(() => resolveAccent(readAccentPref()))
  const [isDark, setIsDark] = useState(() => apply(readPref(), resolveAccent(readAccentPref())))

  const reapply = useCallback((p: ThemePref, a: AccentPref) => {
    const scheme = resolveAccent(a)
    setSeason(scheme)
    setIsDark(apply(p, scheme))
  }, [])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    try { localStorage.setItem(THEME_KEY, p) } catch { /* ignore */ }
    reapply(p, accentPref)
  }, [accentPref, reapply])

  const setAccentPref = useCallback((p: AccentPref) => {
    setAccentPrefState(p)
    try { localStorage.setItem(ACCENT_KEY, p) } catch { /* ignore */ }
    reapply(pref, p)
  }, [pref, reapply])

  // Синхронизация между вкладками
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === ACCENT_KEY) {
        const nextPref = readPref()
        const nextAccent = readAccentPref()
        setPrefState(nextPref)
        setAccentPrefState(nextAccent)
        reapply(nextPref, nextAccent)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reapply])

  return { pref, setPref, isDark, season, accentPref, setAccentPref }
}
