// Управление темой: light / dark / system, сохранение в localStorage.

import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'

export type AccentColor = 'indigo' | 'violet' | 'rose' | 'orange' | 'teal' | 'blue'

const THEME_KEY = 'schedule:theme'
const ACCENT_KEY = 'schedule:accent'

const ACCENTS: Record<AccentColor, {
  light: string; lightStrong: string; lightOn: string;
  dark: string; darkStrong: string; darkOn: string;
}> = {
  indigo: { light: '#4A50E0', lightStrong: '#3B41C9', lightOn: '#FFFFFF', dark: '#8B90FF', darkStrong: '#A2A6FF', darkOn: '#101017' },
  violet: { light: '#7C3AED', lightStrong: '#6D28D9', lightOn: '#FFFFFF', dark: '#A78BFA', darkStrong: '#C4B5FD', darkOn: '#17111F' },
  rose:   { light: '#E11D48', lightStrong: '#BE123C', lightOn: '#FFFFFF', dark: '#FB7185', darkStrong: '#FDA4AF', darkOn: '#20100F' },
  orange: { light: '#EA580C', lightStrong: '#C2410C', lightOn: '#FFFFFF', dark: '#FB923C', darkStrong: '#FDBA74', darkOn: '#1F120A' },
  teal:   { light: '#0F8A83', lightStrong: '#0F766E', lightOn: '#FFFFFF', dark: '#5EEAD4', darkStrong: '#99F6E4', darkOn: '#0B1A18' },
  blue:   { light: '#2563EB', lightStrong: '#1D4ED8', lightOn: '#FFFFFF', dark: '#60A5FA', darkStrong: '#93C5FD', darkOn: '#0D1420' },
}

export const ACCENT_OPTIONS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: 'indigo', label: 'Индиго', swatch: '#6366F1' },
  { id: 'violet', label: 'Фиолетовый', swatch: '#8B5CF6' },
  { id: 'rose', label: 'Розовый', swatch: '#F43F5E' },
  { id: 'orange', label: 'Оранжевый', swatch: '#F97316' },
  { id: 'teal', label: 'Бирюзовый', swatch: '#14B8A6' },
  { id: 'blue', label: 'Синий', swatch: '#3B82F6' },
]


function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

function readAccent(): AccentColor {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    if (v && v in ACCENTS) return v as AccentColor
  } catch { /* ignore */ }
  return 'indigo'
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function applyAccent(accent: AccentColor, dark: boolean) {
  const c = ACCENTS[accent]
  const main = dark ? c.dark : c.light
  const strong = dark ? c.darkStrong : c.lightStrong
  const on = dark ? c.darkOn : c.lightOn
  const [r, g, b] = hexToRgb(main)
  const root = document.documentElement
  root.style.setProperty('--accent', main)
  root.style.setProperty('--accent-strong', strong)
  root.style.setProperty('--on-accent', on)
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${dark ? 0.13 : 0.09})`)
  root.style.setProperty('--accent-soft-2', `rgba(${r}, ${g}, ${b}, ${dark ? 0.20 : 0.16})`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, ${dark ? 0.35 : 0.28})`)
}

function apply(pref: ThemePref, accent: AccentColor): boolean {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  applyAccent(accent, dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#0E0E12' : '#F4F4F1')
  return dark
}

export function useTheme(): {
  pref: ThemePref
  setPref: (p: ThemePref) => void
  accent: AccentColor
  setAccent: (a: AccentColor) => void
  isDark: boolean
} {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [accent, setAccentState] = useState<AccentColor>(readAccent)
  const [isDark, setIsDark] = useState(() => apply(readPref(), readAccent()))

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    try { localStorage.setItem(THEME_KEY, p) } catch { /* ignore */ }
    setIsDark(apply(p, accent))
  }, [accent])

  const setAccent = useCallback((a: AccentColor) => {
    setAccentState(a)
    try { localStorage.setItem(ACCENT_KEY, a) } catch { /* ignore */ }
    setIsDark(apply(pref, a))
  }, [pref])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (pref === 'system') setIsDark(apply('system', accent))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref, accent])

  return { pref, setPref, accent, setAccent, isDark }
}
