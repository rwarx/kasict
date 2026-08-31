// Компактный календарь в виде bottom sheet.

import { useMemo, useState } from 'react'
import { formatDateFull, getWeekDays, monthGrid, monthLabel, shiftISO, todayISO } from '../lib/date'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './Icons'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function CalendarSheet({ dateISO, onPick, onClose }: {
  dateISO: string
  onPick: (iso: string) => void
  onClose: () => void
}) {
  const today = todayISO()
  const [view, setView] = useState(() => {
    const d = new Date(dateISO + 'T12:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const cells = useMemo(() => monthGrid(view.year, view.month), [view])
  const marked = useMemo(() => new Set(getWeekDays(today)), [today])

  const shiftMonth = (delta: number) => {
    setView(v => {
      const m = new Date(v.year, v.month + delta, 1)
      return { year: m.getFullYear(), month: m.getMonth() }
    })
  }

  const quick = (iso: string) => {
    onPick(iso)
    onClose()
  }

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Выбор даты">
      <div className="modal-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-handle" aria-hidden="true" />

        <div className="calendar-head">
          <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
            <ChevronLeftIcon />
          </button>
          <div className="calendar-month">{monthLabel(view.year, view.month)}</div>
          <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
            <ChevronRightIcon />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
        </div>

        <div className="calendar-grid">
          {cells.map(c => {
            const selected = c.iso === dateISO
            const isToday = c.iso === today
            const hasRepl = marked.has(c.iso) && !selected
            return (
              <button
                key={c.iso}
                type="button"
                className={[
                  'cal-cell',
                  c.inMonth ? '' : 'out',
                  selected ? 'selected' : '',
                  isToday ? 'today' : '',
                  hasRepl ? 'marked' : '',
                ].join(' ').trim()}
                onClick={() => quick(c.iso)}
                aria-label={formatDateFull(c.iso)}
                aria-pressed={selected}
              >
                {c.day}
              </button>
            )
          })}
        </div>

        <div className="calendar-actions">
          <button type="button" className="btn-ghost" onClick={() => quick(today)}>Сегодня</button>
          <button type="button" className="btn-ghost" onClick={() => quick(shiftISO(today, 1))}>Завтра</button>
          <button type="button" className="btn-solid" onClick={onClose}>
            <CloseIcon size={16} />
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
