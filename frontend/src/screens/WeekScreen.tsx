// Экран недели: все дни выбранной недели.

import { useMemo } from 'react'
import { getDay } from '../services/scheduleService'
import { getWeekDays, shiftISO, todayISO, weekdayName } from '../lib/date'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons'

export function WeekScreen({ group, dateISO, setDateISO }: {
  group: string
  dateISO: string
  setDateISO: (s: string) => void
}) {
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const today = todayISO()

  const weekData = useMemo(() => {
    return weekDays.map(d => ({
      date: d,
      day: getDay(group, new Date(d + 'T12:00:00')),
      isToday: d === today,
    }))
  }, [weekDays, group, today])

  const weekStart = new Date(weekDays[0] + 'T12:00:00')
  const monthGen = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  const weekLabel = `${weekStart.getDate()} ${monthGen[weekStart.getMonth()]}`
  const weekEnd = new Date(weekDays[6] + 'T12:00:00')
  const parity = weekData[0]?.day?.parity
  const isCurrentWeek = weekDays.includes(today)

  function formatPairCount(count: number) {
    if (count === 0) return 'пар нет'
    if (count === 1) return '1 пара'
    if (count >= 2 && count <= 4) return `${count} пары`
    return `${count} пар`
  }

  return (
    <>
      <section className="date-hero">
        <div className="date-hero-top">
          <div>
            <div className="date-eyebrow">Неделя</div>
            <h1 className="date-title">{weekLabel} — {weekEnd.getDate()} {monthGen[weekEnd.getMonth()]}</h1>
          </div>
        </div>
        {parity && (
          <div className="date-tags">
            <span className={`badge ${parity === 'odd' ? 'accent' : 'blue'}`}>
              {parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя'}
            </span>
          </div>
        )}
      </section>

      <div className="quick-nav">
        <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, -7))} aria-label="Предыдущая неделя">
          <ChevronLeftIcon size={16} />
        </button>
        <div className="quick-seg">
          <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(today, -7))}>Прошлая</button>
          <button type="button" className={`quick-chip ${isCurrentWeek ? 'current' : ''}`} onClick={() => setDateISO(today)}>Текущая</button>
          <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(today, 7))}>Следующая</button>
        </div>
        <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, 7))} aria-label="Следующая неделя">
          <ChevronRightIcon size={16} />
        </button>
      </div>

      <div className="week-list animate-in">
        {weekData.map(({ date, day, isToday }) => {
          const visible = day?.lessons.filter(l => l.status === 'cancelled' || l.subject) ?? []
          return (
            <section key={date} className="week-day">
              <button
                type="button"
                className="week-day-header"
                onClick={() => setDateISO(date)}
                aria-label={`${weekdayName(date)}, ${visible.length === 0 ? 'пар нет' : `${visible.length} пар`}. Открыть этот день`}
              >
                <span className="week-day-name">{weekdayName(date)}</span>
                <span className="week-day-date">{new Date(date + 'T12:00:00').getDate()}</span>
                <span className="week-day-count" aria-hidden="true">{formatPairCount(visible.length)}</span>
                {isToday && <span className="badge accent">Сегодня</span>}
                {day?.has_replacements && !isToday && <span className="badge warn">Замены</span>}
              </button>

              {visible.length === 0 ? (
                <div className="week-empty">Пар нет</div>
              ) : (
                visible.map(l => (
                  <div key={l.number} className={`week-lesson ${l.status}`}>
                    <span className="week-lesson-time">{l.time_start}</span>
                    <div className="week-lesson-info">
                      <div className="week-lesson-subject">
                        {l.status === 'cancelled' ? <s>{l.original?.subject || '—'}</s> : l.subject}
                      </div>
                      <div className="week-lesson-meta">
                        {l.status === 'cancelled' ? 'Отменено' : (
                          <>
                            {l.classroom && `${l.classroom} каб.`}
                            {l.teacher && ` · ${l.teacher}`}
                          </>
                        )}
                      </div>
                    </div>
                    {l.status !== 'normal' && l.status !== 'cancelled' && (
                      <span className={`badge ${l.status === 'added' ? 'success' : l.status === 'replaced' ? 'warn' : 'info'}`}>
                        {l.status === 'added' ? '+' : l.status === 'replaced' ? 'З' : '·'}
                      </span>
                    )}
                  </div>
                ))
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
