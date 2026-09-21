// Экран недели: все дни выбранной недели + итоги (пары, окна, часы).

import { useMemo } from 'react'
import { getDay, revalidateInBackground, useDataVersion } from '../services/scheduleService'
import { getWeekDays, shiftISO, todayISO, weekdayName } from '../lib/date'
import { FreshnessIndicator } from '../components/Freshness'
import { BarChartIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/Icons'

interface WeekStats {
  lessons: number
  cancelled: number
  windows: number
  minutes: number
  busiest: string | null
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const hours = minutes / 60
  // 28,5 ч — компактнее «28 ч 30 мин» и всегда влезает в плитку
  const rounded = Math.round(hours * 10) / 10
  return `${String(rounded).replace('.', ',')} ч`
}

export function WeekScreen({ group, dateISO, setDateISO }: {
  group: string
  dateISO: string
  setDateISO: (s: string) => void
}) {
  const dataVersion = useDataVersion()
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const today = todayISO()

  const weekData = useMemo(() => {
    return weekDays.map(d => ({
      date: d,
      day: getDay(group, new Date(d + 'T12:00:00')),
      isToday: d === today,
    }))
  }, [weekDays, group, today, dataVersion])

  const weekStart = new Date(weekDays[0] + 'T12:00:00')
  const monthGen = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  const weekLabel = `${weekStart.getDate()} ${monthGen[weekStart.getMonth()]}`
  const weekEnd = new Date(weekDays[6] + 'T12:00:00')
  const parity = weekData[0]?.day?.parity
  const isCurrentWeek = weekDays.includes(today)

  // Итоги недели: пары без отмен, окна между парами, время в аудитории
  const stats: WeekStats | null = useMemo(() => {
    let lessons = 0
    let cancelled = 0
    let windows = 0
    let minutes = 0
    let busiest: string | null = null
    let busiestCount = 0

    for (const { date, day } of weekData) {
      const active = (day?.lessons ?? []).filter(l => l.status !== 'cancelled' && l.subject)
      cancelled += (day?.lessons ?? []).filter(l => l.status === 'cancelled').length
      lessons += active.length
      if (active.length > busiestCount) {
        busiestCount = active.length
        busiest = weekdayName(date)
      }

      const numbers = active.map(l => l.number).sort((a, b) => a - b)
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] - numbers[i - 1] > 1) windows++
      }

      for (const l of active) {
        minutes += Math.max(0, toMinutes(l.time_end) - toMinutes(l.time_start))
      }
    }

    if (lessons === 0) return null
    return { lessons, cancelled, windows, minutes, busiest }
  }, [weekData])

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
            <span className="badge accent">
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

      {stats && (
        <section className="week-stats" aria-label="Итоги недели">
          <div className="week-stats-title">
            <BarChartIcon size={15} />
            Итоги недели
          </div>
          <div className="week-stats-grid">
            <div className="week-stat">
              <span className="week-stat-num">{stats.lessons}</span>
              <span className="week-stat-label">{plural(stats.lessons, 'пара', 'пары', 'пар')}</span>
            </div>
            <div className="week-stat">
              <span className="week-stat-num">{stats.windows}</span>
              <span className="week-stat-label">{plural(stats.windows, 'окно', 'окна', 'окон')}</span>
            </div>
            <div className="week-stat">
              <span className="week-stat-num">{formatHours(stats.minutes)}</span>
              <span className="week-stat-label">в аудитории</span>
            </div>
            {stats.cancelled > 0 && (
              <div className="week-stat">
                <span className="week-stat-num">{stats.cancelled}</span>
                <span className="week-stat-label">{plural(stats.cancelled, 'отмена', 'отмены', 'отмен')}</span>
              </div>
            )}
          </div>
          {stats.busiest && (
            <div className="week-stats-note">
              Самый загруженный день — <strong>{stats.busiest}</strong>
            </div>
          )}
        </section>
      )}

      <FreshnessIndicator
        updatedAt={weekData[0]?.day?.updated_at}
        onRefresh={() => revalidateInBackground()}
      />
    </>
  )
}
