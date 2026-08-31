// Нижняя навигация: Сегодня / Неделя / Учителя / Время / Настройки.

import type { Screen } from '../types'
import { CalendarIcon, ClockIcon, GridIcon, MessageIcon, SettingsIcon, UsersIcon } from './Icons'

const ITEMS: { id: Screen; label: string; Icon: typeof CalendarIcon }[] = [
  { id: 'schedule', label: 'Сегодня', Icon: CalendarIcon },
  { id: 'week', label: 'Неделя', Icon: GridIcon },
  { id: 'teachers', label: 'Учителя', Icon: UsersIcon },
  { id: 'time', label: 'Время', Icon: ClockIcon },
  { id: 'chat', label: 'Помощник', Icon: MessageIcon },
  { id: 'settings', label: 'Ещё', Icon: SettingsIcon },
]

export function BottomNav({ screen, onChange }: {
  screen: Screen
  onChange: (s: Screen) => void
}) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item ${screen === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
          aria-current={screen === id ? 'page' : undefined}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
