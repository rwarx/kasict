// Главный экран: расписание на выбранный день.

import { useEffect, useMemo, useState } from 'react'
import { getDay, useDataVersion } from '../services/scheduleService'
import type { DaySchedule, LessonView } from '../services/replacementEngine'
import { formatDateFull, formatDateShort, getWeekDays, shiftISO, todayISO, weekdayName } from '../lib/date'
import { isDayX } from '../lib/specialDays'
import { computeLive, useNow } from '../lib/lessonLive'
import { useDayNotes } from '../lib/notes'
import { shareScheduleText } from '../lib/share'
import { CalendarSheet } from '../components/CalendarSheet'
import { LessonCard, ReplacementSheet } from '../components/LessonCard'
import { NoteSheet } from '../components/NoteSheet'
import { FreshnessIndicator } from '../components/Freshness'
import { EmptyDay } from '../components/StateViews'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ShareIcon } from '../components/Icons'
import { downloadScheduleImage } from '../lib/scheduleImage'

export function ScheduleScreen({ group, dateISO, setDateISO }: {
  group: string
  dateISO: string
  setDateISO: (s: string) => void
}) {
  const [day, setDay] = useState<DaySchedule | null>(null)
  const [sheetLesson, setSheetLesson] = useState<LessonView | null>(null)
  const [noteTarget, setNoteTarget] = useState<LessonView | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const dataVersion = useDataVersion()
  const dayNotes = useDayNotes(group, dateISO)

  useEffect(() => {
    setDay(getDay(group, new Date(dateISO + 'T12:00:00')))
  }, [group, dateISO, dataVersion])

  const today = todayISO()
  const isToday = dateISO === today
  const isTomorrow = dateISO === shiftISO(today, 1)
  const isYesterday = dateISO === shiftISO(today, -1)
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const visible = day?.lessons.filter(l => l.status === 'cancelled' || l.subject) ?? []
  const nowMin = useNow(30000)

  const eyebrow = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : isYesterday ? 'Вчера' : weekdayName(dateISO)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(current => (current === message ? '' : current)), 2600)
  }

  const handleShare = () => {
    if (!day) return
    void shareScheduleText({
      date: dateISO,
      group,
      weekday: day.weekday,
      parity: day.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя',
      lessons: visible,
    }).then(result => {
      if (result === 'copied') showToast('Расписание скопировано — вставь в чат')
      if (result === 'failed') showToast('Не удалось поделиться')
    })
  }

  return (
    <>
      <section className="date-hero" aria-label={`Расписание на ${formatDateFull(dateISO)}`}>
        <div className="date-hero-top">
          <div>
            <div className="date-eyebrow">{eyebrow}</div>
            <h1 className="date-title">{formatDateFull(dateISO)}</h1>
          </div>
          <div className="date-actions">
            <button
              type="button"
              className="icon-btn lg"
              onClick={() => setCalendarOpen(true)}
              aria-label="Открыть календарь"
            >
              <CalendarIcon size={20} />
            </button>
            <button
              type="button"
              className="icon-btn lg"
              onClick={handleShare}
              aria-label="Поделиться расписанием текстом"
              title="Поделиться"
            >
              <ShareIcon size={19} />
            </button>
            <button
              type="button"
              className="icon-btn lg"
              onClick={() => day && downloadScheduleImage({
                date: dateISO,
                group,
                weekday: day.weekday,
                parity: day.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя',
                lessons: visible,
              })}
              aria-label="Скачать расписание изображением"
              title="Скачать изображение"
            >
              <DownloadIcon size={19} />
            </button>
          </div>
        </div>
        {day?.parity && (
          <div className="date-tags">
            <span className={`badge ${day.parity === 'odd' ? 'accent' : 'blue'}`}>
              {day.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя'}
            </span>
            {day.has_replacements && !day.day_note && (
              <span className="badge warn">Есть замены</span>
            )}
            {isDayX(dateISO) && (
              <span className="badge dayx">День X</span>
            )}
          </div>
        )}
      </section>

      <div className="quick-nav" role="navigation" aria-label="Быстрый переход по датам">
        <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Предыдущий день">
          <ChevronLeftIcon size={16} />
        </button>
        <div className="quick-seg">
          <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(today, -1))} aria-pressed={isYesterday}>Вчера</button>
          <button type="button" className={`quick-chip ${isToday ? 'current' : ''}`} onClick={() => setDateISO(today)} aria-pressed={isToday}>Сегодня</button>
          <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(today, 1))} aria-pressed={isTomorrow}>Завтра</button>
        </div>
        <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, 1))} aria-label="Следующий день">
          <ChevronRightIcon size={16} />
        </button>
      </div>

      <div className="date-strip">
        <button type="button" className="date-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, -7))} aria-label="Предыдущая неделя">
          <ChevronLeftIcon size={16} />
        </button>
        <div className="date-days">
          {weekDays.map(d => {
            const { name, num } = formatDateShort(d)
            const selected = d === dateISO
            const isT = d === today
            return (
              <button
                key={d}
                type="button"
                className={`date-day ${selected ? 'selected' : ''} ${isT ? 'today' : ''}`}
                onClick={() => setDateISO(d)}
                aria-pressed={selected}
              >
                <span className="date-day-name">{name}</span>
                <span className="date-day-num">{num}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="date-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, 7))} aria-label="Следующая неделя">
          <ChevronRightIcon size={16} />
        </button>
      </div>

      {day?.day_note && (
        <div className="notice info" role="status">
          <span className="notice-dot" aria-hidden="true" />
          {day.day_note}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyDay dateLabel={formatDateFull(dateISO)} celebrate={isDayX(dateISO)} />
      ) : (
        <div className="lessons animate-in" key={dateISO}>
          {visible.map((l, i) => (
            <div className="stagger" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} key={l.number}>
              <LessonCard
                lesson={l}
                live={isToday && l.status !== 'cancelled' ? computeLive(l.time_start, l.time_end, nowMin) : null}
                note={dayNotes[l.number] ?? null}
                onOpenNote={() => setNoteTarget(l)}
                onClick={() => l.status !== 'normal' && setSheetLesson(l)}
              />
            </div>
          ))}
        </div>
      )}

      <FreshnessIndicator updatedAt={day?.updated_at} />

      {noteTarget && (
        <NoteSheet
          group={group}
          dateISO={dateISO}
          pair={noteTarget.number}
          subject={noteTarget.subject}
          onClose={() => setNoteTarget(null)}
        />
      )}

      {sheetLesson && <ReplacementSheet lesson={sheetLesson} onClose={() => setSheetLesson(null)} />}
      {calendarOpen && (
        <CalendarSheet dateISO={dateISO} onPick={setDateISO} onClose={() => setCalendarOpen(false)} />
      )}

      {toast && <div className="app-toast" role="status">{toast}</div>}
    </>
  )
}
