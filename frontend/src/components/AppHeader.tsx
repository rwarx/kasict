// Верхняя панель: бренд KASICT, чип группы, переключатель темы.

import type { ThemePref } from '../lib/theme'
import { ChevronDownIcon, LaptopIcon, MoonIcon, SunIcon } from './Icons'

export function ThemeButton({ pref, onCycle, isDark }: {
  pref: ThemePref
  onCycle: () => void
  isDark: boolean
}) {
  const label = pref === 'system' ? 'Системная тема' : pref === 'dark' ? 'Тёмная тема' : 'Светлая тема'
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onCycle}
      aria-label={`${label}. Нажмите, чтобы переключить`}
      title={label}
    >
      {pref === 'system' ? <LaptopIcon /> : isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

export function AppHeader({ group, onOpenGroup, pref, onCycleTheme, isDark }: {
  group: string
  onOpenGroup: () => void
  pref: ThemePref
  onCycleTheme: () => void
  isDark: boolean
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">K</span>
        <span className="brand-name">KASICT</span>
      </div>
      <div className="app-header-actions">
        <button type="button" className="group-chip" onClick={onOpenGroup} aria-label={`Группа ${group}. Изменить группу`}>
          <span className="group-chip-label">Группа</span>
          <span className="group-chip-value">{group}</span>
          <ChevronDownIcon size={14} />
        </button>
        <ThemeButton pref={pref} onCycle={onCycleTheme} isDark={isDark} />
      </div>
    </header>
  )
}
