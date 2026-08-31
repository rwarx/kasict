import { useEffect, useMemo, useState } from 'react'
import { getDay, getGroups, getMeta, loadData } from './services/scheduleService'
import { disableNotifications, enableNotifications, handleNewData, isNotifEnabled, isNotifSupported, notifStatusText } from './services/notifications'
import type { DaySchedule, LessonView } from './services/replacementEngine'

const GROUP_KEY = 'schedule:group'
const ONBOARDING_KEY = 'schedule:onboarded'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekDays(centerISO: string): string[] {
  const d = new Date(centerISO + 'T12:00:00')
  const dayOfWeek = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - dayOfWeek)
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    days.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`)
  }
  return days
}

function formatDateFull(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatDateShort(iso: string): { name: string; num: number } {
  const d = new Date(iso + 'T12:00:00')
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
  return { name: names[d.getDay()], num: d.getDate() }
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

const DAY_NAMES_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

type Screen = 'schedule' | 'week' | 'time' | 'settings'

export default function App() {
  const [group, setGroup] = useState<string | null>(() => localStorage.getItem(GROUP_KEY))
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === 'true')
  const [dateISO, setDateISO] = useState(todayISO())
  const [screen, setScreen] = useState<Screen>('schedule')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
      .then(() => {
        setLoading(false)
        const meta = getMeta()
        if (meta) handleNewData(meta)
      })
      .catch(() => { setError('Не удалось загрузить данные'); setLoading(false) })
  }, [])

  const completeOnboarding = (selectedGroup: string) => {
    localStorage.setItem(GROUP_KEY, selectedGroup)
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setGroup(selectedGroup)
    setOnboarded(true)
  }

  const changeGroup = (newGroup: string) => {
    localStorage.setItem(GROUP_KEY, newGroup)
    setGroup(newGroup)
  }

  if (!onboarded && !group) {
    return <OnboardingFlow onComplete={completeOnboarding} loading={loading} error={error} />
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorScreen onRetry={() => window.location.reload()} />
  }

  return (
    <>
      <div className="main-content">
        <div className="container">
          {screen === 'schedule' && group && (
            <ScheduleScreen group={group} dateISO={dateISO} setDateISO={setDateISO} />
          )}
          {screen === 'week' && group && (
            <WeekScreen group={group} dateISO={dateISO} setDateISO={setDateISO} />
          )}
          {screen === 'time' && (
            <TimeScreen />
          )}
          {screen === 'settings' && (
            <SettingsScreen group={group} onChangeGroup={changeGroup} />
          )}
        </div>
      </div>

      <nav className="bottom-nav">
        <div className="nav-inner">
          <button className={`nav-item ${screen === 'schedule' ? 'active' : ''}`}
                  onClick={() => setScreen('schedule')}>
            <span className="nav-icon">📅</span>
            Сегодня
          </button>
          <button className={`nav-item ${screen === 'week' ? 'active' : ''}`}
                  onClick={() => setScreen('week')}>
            <span className="nav-icon">📆</span>
            Неделя
          </button>
          <button className={`nav-item ${screen === 'time' ? 'active' : ''}`}
                  onClick={() => setScreen('time')}>
            <span className="nav-icon">🕐</span>
            Время
          </button>
          <button className={`nav-item ${screen === 'settings' ? 'active' : ''}`}
                  onClick={() => setScreen('settings')}>
            <span className="nav-icon">⚙️</span>
            Настройки
          </button>
        </div>
      </nav>
    </>
  )
}

/* ==================== ONBOARDING ==================== */

function OnboardingFlow({ onComplete, loading, error }: {
  onComplete: (group: string) => void; loading: boolean; error: string
}) {
  const [step, setStep] = useState<'welcome' | 'select' | 'success'>('welcome')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen onRetry={() => window.location.reload()} />

  if (step === 'welcome') {
    return (
      <div className="onboarding">
        <div className="onboarding-content">
          <div className="onboarding-icon">👋</div>
          <h1 className="onboarding-title">Привет!</h1>
          <p className="onboarding-text">
            Давай настроим твоё расписание.<br />
            Это займёт буквально пару секунд.
          </p>
          <button className="onboarding-btn" onClick={() => setStep('select')}>
            Продолжить
          </button>
        </div>
      </div>
    )
  }

  if (step === 'select') {
    return (
      <GroupSelectScreen
        onSelect={(g) => { setSelectedGroup(g); setStep('success') }}
      />
    )
  }

  return (
    <div className="success-screen">
      <div className="success-icon">✓</div>
      <h1 className="success-title">{selectedGroup}</h1>
      <p className="success-text">Отлично! Теперь это твоя группа.</p>
      <button className="onboarding-btn" onClick={() => onComplete(selectedGroup!)}>
        Посмотреть расписание
      </button>
    </div>
  )
}

function GroupSelectScreen({ onSelect }: { onSelect: (g: string) => void }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => getGroups(), [])

  const filtered = useMemo(
    () => groups.filter(g => g.name.toLowerCase().replace(/\s|-/g, '').includes(query.toLowerCase().replace(/\s|-/g, ''))),
    [groups, query],
  )

  const popular = useMemo(() => groups.slice(0, 5), [groups])

  return (
    <div className="group-select">
      <div className="group-select-header">
        <h1 className="group-select-title">Выбери группу</h1>
        <p className="group-select-subtitle">Найди свою группу в списке</p>
      </div>

      <input
        className="search-input"
        placeholder="🔍 Поиск группы..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />

      {!query && (
        <>
          <div className="group-section-title">Популярные</div>
          <ul className="group-list" style={{ marginBottom: 16 }}>
            {popular.map(g => (
              <li key={g.name}>
                <button className="group-btn" onClick={() => onSelect(g.name)}>{g.name}</button>
              </li>
            ))}
          </ul>
          <div className="group-section-title">Все группы</div>
        </>
      )}

      <ul className="group-list">
        {filtered.map(g => (
          <li key={g.name}>
            <button className="group-btn" onClick={() => onSelect(g.name)}>{g.name}</button>
          </li>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <div className="empty-text">Группа не найдена</div>
          </div>
        )}
      </ul>
    </div>
  )
}

/* ==================== LOADING & ERROR ==================== */

function LoadingScreen() {
  return (
    <div className="main-content">
      <div className="container">
        <div style={{ padding: '24px 0' }}>
          <div className="skeleton skeleton-line w-50" style={{ height: 28, marginBottom: 8 }} />
          <div className="skeleton skeleton-line w-30" style={{ height: 16 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div className="skeleton" style={{ height: 48, borderRadius: 12 }} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-line w-30" />
            <div className="skeleton skeleton-line w-70" />
            <div className="skeleton skeleton-line w-50" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="main-content">
      <div className="container">
        <div className="error-state">
          <div className="error-icon">😕</div>
          <h2 className="error-title">Не удалось загрузить</h2>
          <p className="error-text">
            Похоже, сайт колледжа временно недоступен.<br />
            Попробуйте обновить страницу.
          </p>
          <button className="error-btn" onClick={onRetry}>Повторить</button>
        </div>
      </div>
    </div>
  )
}

/* ==================== SCHEDULE SCREEN ==================== */

function ScheduleScreen({ group, dateISO, setDateISO }: {
  group: string; dateISO: string; setDateISO: (s: string) => void
}) {
  const [day, setDay] = useState<DaySchedule | null>(null)
  const [sheetLesson, setSheetLesson] = useState<LessonView | null>(null)

  useEffect(() => {
    setDay(getDay(group, new Date(dateISO + 'T12:00:00')))
  }, [group, dateISO])

  const isToday = dateISO === todayISO()
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const visible = day?.lessons.filter(l => l.status === 'cancelled' || l.subject) ?? []

  return (
    <>
      <div className="header">
        <h1 className="header-greeting">{getGreeting()} 👋</h1>
        <div className="header-group">
          <span>{group}</span>
        </div>
      </div>

      <div className="date-header">
        <div className="date-main">{formatDateFull(dateISO)}</div>
        {day?.parity && (
          <span className={`parity-chip ${day.parity}`}>
            {day.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя'}
          </span>
        )}
      </div>

      <div className="date-strip">
        <button className="date-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, -7))}>‹</button>
        <div className="date-days">
          {weekDays.map(d => {
            const { name, num } = formatDateShort(d)
            const selected = d === dateISO
            const today = d === todayISO()
            return (
              <button
                key={d}
                className={`date-day ${selected ? 'selected' : ''} ${today ? 'today' : ''}`}
                onClick={() => setDateISO(d)}
              >
                <div className="date-day-name">{name}</div>
                <div className="date-day-num">{num}</div>
              </button>
            )
          })}
        </div>
        <button className="date-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, 7))}>›</button>
      </div>

      {!isToday && (
        <button className="today-btn" onClick={() => setDateISO(todayISO())}>
          Сегодня
        </button>
      )}

      {day?.day_note && (
        <div className="alert-banner info">
          <span className="alert-banner-icon">📌</span>
          {day.day_note}
        </div>
      )}

      {day?.has_replacements && !day.day_note && (
        <div className="alert-banner warn">
          <span className="alert-banner-icon">⚠️</span>
          Есть замены на этот день
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty-state animate-in">
          <div className="empty-icon">🎉</div>
          <h2 className="empty-title">Пар нет</h2>
          <p className="empty-text">Можно отдыхать</p>
        </div>
      ) : (
        <div className="lessons animate-in">
          {visible.map(l => (
            <LessonCard
              key={l.number}
              lesson={l}
              onClick={() => l.status !== 'normal' && setSheetLesson(l)}
            />
          ))}
        </div>
      )}

      {day?.updated_at && (
        <div className="footer-info">
          Обновлено: {new Date(day.updated_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {sheetLesson && (
        <ChangeSheet lesson={sheetLesson} onClose={() => setSheetLesson(null)} />
      )}
    </>
  )
}

function LessonCard({ lesson, onClick }: { lesson: LessonView; onClick: () => void }) {
  const hasChange = lesson.status !== 'normal'
  const isCancelled = lesson.status === 'cancelled'

  return (
    <div
      className={`lesson-card ${lesson.status} ${hasChange ? 'clickable' : ''}`}
      onClick={hasChange ? onClick : undefined}
    >
      <div className="lesson-header">
        <span className="lesson-num">{lesson.number}</span>
        <span className="lesson-time">{lesson.time_start} — {lesson.time_end}</span>
        {lesson.status === 'cancelled' && <span className="lesson-badge cancel">Отмена</span>}
        {lesson.status === 'added' && <span className="lesson-badge added">Доп. пара</span>}
        {lesson.status === 'replaced' && <span className="lesson-badge replaced">Замена</span>}
        {lesson.status === 'teacher_changed' && <span className="lesson-badge teacher">Учитель</span>}
        {lesson.status === 'room_changed' && <span className="lesson-badge room">Кабинет</span>}
      </div>

      {isCancelled ? (
        <div className="lesson-cancelled-text">Пара отменена</div>
      ) : (
        <>
          <div className="lesson-subject">{lesson.subject || '—'}</div>
          <div className="lesson-meta">
            {lesson.teacher && (
              <span className="lesson-meta-item">{lesson.teacher}</span>
            )}
            {lesson.is_remote ? (
              <span className="lesson-meta-item">💻 Дистанционно</span>
            ) : lesson.classroom && (
              <span className="lesson-meta-item">📍 {lesson.classroom} каб.</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ChangeSheet({ lesson, onClose }: { lesson: LessonView; onClose: () => void }) {
  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <h2 className="sheet-title">
          {lesson.status === 'cancelled' ? 'Отмена' :
           lesson.status === 'added' ? 'Дополнительная пара' : 'Замена'}
        </h2>
        <div className="sheet-pair-info">
          {lesson.number} пара · {lesson.time_start} — {lesson.time_end}
        </div>

        {lesson.original && (
          <div className="sheet-change">
            <div className="sheet-block">
              <div className="sheet-block-label">Было</div>
              <div className="sheet-block-subject">{lesson.original.subject || '—'}</div>
              <div className="sheet-block-meta">
                {lesson.original.teacher && <span>{lesson.original.teacher}</span>}
                {lesson.original.classroom && <span> · {lesson.original.classroom} каб.</span>}
              </div>
            </div>
            <div className="sheet-arrow">↓</div>
            <div className="sheet-block">
              <div className="sheet-block-label">Стало</div>
              {lesson.status === 'cancelled' ? (
                <div className="sheet-block-subject" style={{ color: 'var(--red)' }}>Отменено</div>
              ) : (
                <>
                  <div className="sheet-block-subject">{lesson.subject}</div>
                  <div className="sheet-block-meta">
                    {lesson.teacher && <span>{lesson.teacher}</span>}
                    {lesson.classroom && <span> · {lesson.classroom} каб.</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <button className="sheet-btn" onClick={onClose}>Понятно</button>
      </div>
    </>
  )
}

/* ==================== WEEK SCREEN ==================== */

function WeekScreen({ group, dateISO, setDateISO }: {
  group: string; dateISO: string; setDateISO: (s: string) => void
}) {
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const today = todayISO()

  const weekData = useMemo(() => {
    return weekDays.map(d => ({
      date: d,
      day: getDay(group, new Date(d + 'T12:00:00')),
      isToday: d === today
    }))
  }, [weekDays, group, today])

  const weekStart = new Date(weekDays[0] + 'T12:00:00')
  const weekLabel = `${weekStart.getDate()} ${weekStart.toLocaleDateString('ru-RU', { month: 'long' })}`

  return (
    <>
      <div className="week-header">
        <h1 className="week-title">Неделя</h1>
      </div>

      <div className="week-nav">
        <button className="week-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, -7))}>‹</button>
        <span className="week-nav-label">{weekLabel}</span>
        <button className="week-nav-btn" onClick={() => setDateISO(shiftISO(dateISO, 7))}>›</button>
      </div>

      {weekData[0]?.day?.parity && (
        <span className={`parity-chip ${weekData[0].day.parity}`}>
          {weekData[0].day.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя'}
        </span>
      )}

      <div className="animate-in">
        {weekData.map(({ date, day, isToday }) => {
          const visible = day?.lessons.filter(l => l.status === 'cancelled' || l.subject) ?? []
          const weekdayNum = (new Date(date + 'T12:00:00').getDay() + 6) % 7

          return (
            <div key={date} className="week-day">
              <div className="week-day-header">
                <span className="week-day-date">
                  {DAY_NAMES_FULL[weekdayNum]}, {new Date(date + 'T12:00:00').getDate()}
                </span>
                {isToday && <span className="week-day-badge">Сегодня</span>}
              </div>

              {visible.length === 0 ? (
                <div style={{ padding: '12px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>
                  Пар нет
                </div>
              ) : (
                visible.map(l => (
                  <div key={l.number} className="week-lesson">
                    <span className="week-lesson-num">{l.number}</span>
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
                    {l.status === 'replaced' && (
                      <span className="week-lesson-badge replaced">Замена</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ==================== TIME SCREEN ==================== */

function toMin(h: number, m: number) { return h * 60 + m }
function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number)
  return [h, m]
}

interface Slot {
  type: 'pair' | 'break' | 'lunch'
  label: string
  start: number
  end: number
  pairNum?: number
}

const TIMELINE: Slot[] = (() => {
  const slots: Slot[] = []
  const pairs: [string, string][] = [
    ['08:00', '09:35'], ['09:45', '11:20'], ['11:45', '13:20'],
    ['13:45', '15:20'], ['15:30', '17:05'], ['17:15', '18:50'],
  ]
  const lunchAfter = new Set([2, 3])
  const shortBreakAfter = new Set([1, 4, 5])

  for (let i = 0; i < pairs.length; i++) {
    const num = i + 1
    const [sh1, sm1] = parseHHMM(pairs[i][0])
    const [eh1, em1] = parseHHMM(pairs[i][1])
    const start = toMin(sh1, sm1)
    const mid = toMin(...parseHHMM(`${String(sh1 + Math.floor(((eh1 * 60 + em1) - (sh1 * 60 + sm1)) / 2 / 60)).padStart(2, '0')}:${String(Math.floor(((eh1 * 60 + em1) - (sh1 * 60 + sm1)) / 2) % 60).padStart(2, '0')}`))
    const end = toMin(eh1, em1)

    slots.push({ type: 'pair', label: `${num} пара`, start, end: mid, pairNum: num })
    slots.push({ type: 'break', label: 'Перемена 5 мин', start: mid, end: mid + 5 })

    if (i < pairs.length - 1) {
      const [sh2, sm2] = parseHHMM(pairs[i + 1][0])
      const nextStart = toMin(sh2, sm2)
      if (lunchAfter.has(num)) {
        slots.push({ type: 'lunch', label: 'Обеденный перерыв', start: end, end: nextStart })
      } else if (shortBreakAfter.has(num)) {
        slots.push({ type: 'break', label: 'Перемена 10 мин', start: end, end: nextStart })
      }
    }
  }
  return slots
})()

function fmtTime(m: number) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return '00:00.000'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const millis = ms % 1000
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function getSlotEndMs(slot: Slot): number {
  const [h, m] = [Math.floor(slot.end / 60), slot.end % 60]
  return (h * 3600 + m * 60) * 1000
}

function getSlotStartMs(slot: Slot): number {
  const [h, m] = [Math.floor(slot.start / 60), slot.start % 60]
  return (h * 3600 + m * 60) * 1000
}

interface TimeStatus {
  status: 'weekend' | 'empty' | 'before' | 'active'
  current: Slot | null
  next: Slot | null
  remainingMs: number
  totalMs: number
}

function getTimeStatus(): TimeStatus {
  const now = new Date()
  const nowSec = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const day = now.getDay()
  if (day === 0 || day === 6) return { status: 'weekend', current: null, next: null, remainingMs: 0, totalMs: 0 }

  let current: Slot | null = null
  let next: Slot | null = null

  for (const slot of TIMELINE) {
    if (nowSec >= getSlotStartMs(slot) && nowSec < getSlotEndMs(slot)) {
      current = slot
      break
    }
    if (nowSec < getSlotStartMs(slot)) {
      next = slot
      break
    }
  }

  if (!current && !next) return { status: 'empty', current: null, next: null, remainingMs: 0, totalMs: 0 }

  if (current) {
    const endMs = getSlotEndMs(current)
    const startMs = getSlotStartMs(current)
    const remainingMs = Math.max(0, endMs - nowSec)
    const totalMs = endMs - startMs
    const nxt = TIMELINE.find(s => s.start >= current!.end) ?? null
    return { status: 'active', current, next: nxt, remainingMs, totalMs }
  }

  return { status: 'before', current: null, next, remainingMs: 0, totalMs: 0 }
}

function Hourglass({ flipKey }: { flipKey: number }) {
  return (
    <div className="hourglass-wrapper">
      <div className={`hourglass ${flipKey % 2 === 0 ? '' : 'flipped'}`}>
        <svg viewBox="0 0 48 80" className="hourglass-svg">
          <defs>
            <linearGradient id="sand-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="sand-bot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.9" />
            </linearGradient>
            <clipPath id="bulb-top">
              <path d="M8,4 L40,4 L40,32 Q40,36 36,38 L26,42 Q24,43 22,42 L12,38 Q8,36 8,32 Z" />
            </clipPath>
            <clipPath id="bulb-bot">
              <path d="M12,42 L22,42 Q24,43 26,42 L36,38 Q40,36 40,40 L40,76 L8,76 L8,40 Q8,36 12,38 Z" />
            </clipPath>
          </defs>

          {/* Frame */}
          <path
            d="M8,2 L40,2 L40,4 Q42,4 42,6 L42,6 Q42,34 34,38 L26,42 Q24,43 22,42 L14,38 Q6,34 6,6 Q6,4 8,4 Z"
            fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinejoin="round"
          />
          <path
            d="M14,42 L22,42 Q24,43 26,42 L34,38 Q42,34 42,6 L42,6 Q42,4 40,4 L8,4 Q6,4 6,6 Q6,34 14,38 Z"
            fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinejoin="round"
          />
          <rect x="4" y="0" width="40" height="4" rx="2" fill="var(--text-secondary)" />
          <rect x="4" y="76" width="40" height="4" rx="2" fill="var(--text-secondary)" />

          {/* Top sand */}
          <g clipPath="url(#bulb-top)">
            <rect className="sand-top-level" x="8" y="4" width="34" height="30" fill="url(#sand-top)" />
          </g>

          {/* Stream */}
          <line className="sand-stream" x1="24" y1="42" x2="24" y2="42" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />

          {/* Bottom sand */}
          <g clipPath="url(#bulb-bot)">
            <rect className="sand-bot-level" x="8" y="76" width="34" height="0" fill="url(#sand-bot)" />
          </g>
        </svg>
      </div>
    </div>
  )
}

function TimeScreen() {
  const [, setTick] = useState(0)
  const [flipKey, setFlipKey] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [])

  // Flip hourglass every 5 minutes
  useEffect(() => {
    const id = setInterval(() => setFlipKey(k => k + 1), 5 * 60 * 1000)
    // Sync flip to the next 5-minute boundary
    const now = Date.now()
    const msToNext5 = (5 * 60 * 1000) - (now % (5 * 60 * 1000))
    const sync = setTimeout(() => setFlipKey(k => k + 1), msToNext5)
    return () => { clearInterval(id); clearTimeout(sync) }
  }, [])

  const ts = getTimeStatus()
  const now = new Date()

  if (ts.status === 'weekend') {
    return (
      <>
        <div className="settings-header">
          <h1 className="settings-title">Время</h1>
        </div>
        <div className="time-status-card">
          <Hourglass flipKey={flipKey} />
          <div className="time-big">{fmtCountdown(0)}</div>
          <div className="time-subtitle">Выходной — пар нет</div>
        </div>
      </>
    )
  }

  if (ts.status === 'empty' || (!ts.current && !ts.next)) {
    return (
      <>
        <div className="settings-header">
          <h1 className="settings-title">Время</h1>
        </div>
        <div className="time-status-card">
          <Hourglass flipKey={flipKey} />
          <div className="time-big">{fmtCountdown(0)}</div>
          <div className="time-subtitle">Пары закончились</div>
        </div>
      </>
    )
  }

  if (ts.status === 'before' && ts.next) {
    const nextStartMs = getSlotStartMs(ts.next)
    const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
    const diff = nextStartMs - nowMs
    return (
      <>
        <div className="settings-header">
          <h1 className="settings-title">Время</h1>
        </div>
        <div className="time-status-card">
          <Hourglass flipKey={flipKey} />
          <div className="time-big">{fmtCountdown(Math.max(0, diff))}</div>
          <div className="time-subtitle">До начала {ts.next.label}</div>
        </div>
      </>
    )
  }

  const current = ts.current!
  const progress = ts.totalMs > 0 ? ((ts.totalMs - ts.remainingMs) / ts.totalMs) * 100 : 0
  const isLunch = current.type === 'lunch'
  const isBreak = current.type === 'break'
  const pairName = current.pairNum ? `${current.pairNum} пара` : current.label

  return (
    <>
      <div className="settings-header">
        <h1 className="settings-title">Время</h1>
      </div>

      <div className={`time-status-card ${isLunch ? 'lunch' : isBreak ? 'break' : 'pair'}`}>
        <Hourglass flipKey={flipKey} />
        <div className="time-big">{fmtCountdown(ts.remainingMs)}</div>
        <div className="time-current-label">
          {isLunch ? 'Обеденный перерыв' : isBreak ? 'Перемена' : pairName}
        </div>
        <div className="time-progress-track">
          <div className="time-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {ts.next && (
          <div className="time-next">
            Далее: {ts.next.label} ({fmtTime(ts.next.start)})
          </div>
        )}
      </div>

      <div className="time-timeline">
        {TIMELINE.map((slot, i) => {
          const isCurrent = current && slot.start === current.start && slot.end === current.end
          const nowSec = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
          const isPast = nowSec >= getSlotEndMs(slot)
          const isFuture = nowSec < getSlotStartMs(slot)
          return (
            <div
              key={i}
              className={`time-slot ${slot.type} ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
            >
              <div className="time-slot-time">
                {fmtTime(slot.start)}
              </div>
              <div className="time-slot-bar">
                <div className="time-slot-label">{slot.label}</div>
              </div>
              <div className="time-slot-time">
                {fmtTime(slot.end)}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ==================== SETTINGS SCREEN ==================== */

function SettingsScreen({ group, onChangeGroup }: {
  group: string | null; onChangeGroup: (g: string) => void
}) {
  const [showGroupSelect, setShowGroupSelect] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [notifOn, setNotifOn] = useState(isNotifEnabled())
  const [notifStatus, setNotifStatus] = useState(notifStatusText())
  const meta = getMeta()

  const handleToggleNotif = async () => {
    if (!isNotifSupported()) return
    if (notifOn) {
      disableNotifications()
      setNotifOn(false)
    } else {
      const granted = await enableNotifications()
      setNotifOn(granted)
    }
    setNotifStatus(notifStatusText())
  }

  const handleChangeGroup = () => {
    setShowConfirm(true)
  }

  const confirmChange = () => {
    setShowConfirm(false)
    setShowGroupSelect(true)
  }

  if (showGroupSelect) {
    return (
      <div style={{ margin: '-16px -16px 0', minHeight: '100vh' }}>
        <GroupSelectScreen
          onSelect={(g) => { onChangeGroup(g); setShowGroupSelect(false) }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="settings-header">
        <h1 className="settings-title">Настройки</h1>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Группа</div>
        <div className="settings-card">
          <div className="settings-row" onClick={handleChangeGroup}>
            <div className="settings-row-info">
              <div className="settings-row-label">Моя группа</div>
              <div className="settings-row-value">{group || 'Не выбрана'}</div>
            </div>
            <span className="settings-row-arrow">›</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Уведомления</div>
        <div className="settings-card">
          <div className="settings-row" onClick={handleToggleNotif}>
            <div className="settings-row-info">
              <div className="settings-row-label">О новом расписании</div>
              <div className="settings-row-value">{notifStatus}</div>
            </div>
            <label className="toggle" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={notifOn}
                disabled={!isNotifSupported() || Notification.permission === 'denied'}
                onChange={handleToggleNotif}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Данные</div>
        <div className="settings-card">
          <div className="info-row">
            <span className="info-label">Групп в системе</span>
            <span className="info-value">{meta?.groups_count ?? '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Последнее обновление</span>
            <span className="info-value">
              {meta?.updated_at
                ? new Date(meta.updated_at).toLocaleString('ru-RU', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })
                : '—'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Замены доступны на</span>
            <span className="info-value">
              {meta?.replacement_dates?.length
                ? meta.replacement_dates.map(d => {
                    const date = new Date(d + 'T12:00:00')
                    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                  }).join(', ')
                : 'нет'}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Приложение</div>
        <div className="settings-card">
          <div className="info-row">
            <span className="info-label">Версия</span>
            <span className="info-value">2.0.0</span>
          </div>
          <div className="info-row">
            <span className="info-label">Источник данных</span>
            <span className="info-value">kasict.ru</span>
          </div>
        </div>
      </div>

      <button className="update-btn" onClick={() => window.location.reload()}>
        ↻ Обновить данные
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Изменить группу?"
          text="Расписание будет обновлено для новой группы."
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmChange}
        />
      )}
    </>
  )
}

function ConfirmDialog({ title, text, onCancel, onConfirm }: {
  title: string; text: string; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-text">{text}</p>
        <div className="dialog-buttons">
          <button className="dialog-btn cancel" onClick={onCancel}>Отмена</button>
          <button className="dialog-btn confirm" onClick={onConfirm}>Изменить</button>
        </div>
      </div>
    </div>
  )
}
