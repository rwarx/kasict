// Верхняя панель: бренд KASICT, чип «День X», чип группы, переключатель белой/чёрной темы.

import type { ThemePref } from '../lib/theme'
import { ChevronDownIcon, MoonIcon, SparklesIcon, SunIcon } from './Icons'

export function ThemeButton({ pref, onToggle, isDark }: {
  pref: ThemePref
  onToggle: () => void
  isDark: boolean
}) {
  const label = isDark ? 'Чёрная тема' : 'Белая тема'
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onToggle}
      aria-label={`${label}. Нажмите, чтобы переключить`}
      title={label}
      data-pref={pref}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

export function AppHeader({ group, onOpenGroup, pref, onToggleTheme, isDark, dayX }: {
  group: string
  onOpenGroup: () => void
  pref: ThemePref
  onToggleTheme: () => void
  isDark: boolean
  dayX?: boolean
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">K</span>
        <span className="brand-name">KASICT</span>
        {dayX && (
          <span className="dayx-chip" title="Сегодня — День X! (18 сентября)">
            <SparklesIcon size={13} />
            День X
          </span>
        )}
      </div>
      <div className="app-header-actions">
        <button type="button" className="group-chip" onClick={onOpenGroup} aria-label={`Группа ${group}. Изменить группу`}>
          <span className="group-chip-label">Группа</span>
          <span className="group-chip-value">{group}</span>
          <ChevronDownIcon size={14} />
        </button>
        <ThemeButton pref={pref} onToggle={onToggleTheme} isDark={isDark} />
      </div>
    </header>
  )
}
