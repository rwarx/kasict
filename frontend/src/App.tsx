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

interface Slot {
  type: 'pair' | 'break' | 'lunch'
  label: string
  startMin: number
  endMin: number
  pairNum?: number
}

const TIMELINE: Slot[] = (() => {
  const PAIRS: [number, number, number, number][] = [
    [8, 0, 9, 35],
    [9, 45, 11, 20],
    [11, 45, 13, 20],
    [13, 45, 15, 20],
    [15, 30, 17, 5],
    [17, 15, 18, 50],
  ]
  const LUNCH_AFTER = [2, 3]
  const result: Slot[] = []

  for (let i = 0; i < PAIRS.length; i++) {
    const num = i + 1
    const [sh, sm, eh, em] = PAIRS[i]
    result.push({ type: 'pair', label: `${num} пара`, startMin: toMin(sh, sm), endMin: toMin(eh, em), pairNum: num })

    if (i < PAIRS.length - 1) {
      const [nh, nm] = [PAIRS[i + 1][0], PAIRS[i + 1][1]]
      const breakStart = toMin(eh, em)
      const breakEnd = toMin(nh, nm)
      if (LUNCH_AFTER.includes(num)) {
        result.push({ type: 'lunch', label: 'Обед', startMin: breakStart, endMin: breakEnd })
      } else {
        result.push({ type: 'break', label: 'Перемена', startMin: breakStart, endMin: breakEnd })
      }
    }
  }
  return result
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

function slotMs(min: number) { return min * 60 * 1000 }

interface TimeStatus {
  status: 'weekend' | 'empty' | 'before' | 'active'
  current: Slot | null
  next: Slot | null
  remainingMs: number
  totalMs: number
}

function getTimeStatus(): TimeStatus {
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const day = now.getDay()
  if (day === 0 || day === 6) return { status: 'weekend', current: null, next: null, remainingMs: 0, totalMs: 0 }

  let current: Slot | null = null
  let next: Slot | null = null

  for (const slot of TIMELINE) {
    const s = slotMs(slot.startMin)
    const e = slotMs(slot.endMin)
    if (nowMs >= s && nowMs < e) {
      current = slot
      break
    }
    if (nowMs < s && !next) {
      next = slot
    }
  }

  if (!current && !next) return { status: 'empty', current: null, next: null, remainingMs: 0, totalMs: 0 }

  if (current) {
    const endMs = slotMs(current.endMin)
    const startMs = slotMs(current.startMin)
    const remainingMs = Math.max(0, endMs - nowMs)
    const totalMs = endMs - startMs
    const nxt = TIMELINE.find(s => s.startMin >= current!.endMin) ?? null
    return { status: 'active', current, next: nxt, remainingMs, totalMs }
  }

  return { status: 'before', current: null, next, remainingMs: 0, totalMs: 0 }
}

function Hourglass({ progress }: { progress: number }) {
  const p = Math.max(0, Math.min(1, progress))

  const topY = 8 + (1 - p) * 28
  const topH = Math.max(0.5, p * 28)
  const botH = Math.max(0.5, (1 - p) * 28)
  const botY = 46 + p * 28

  return (
    <div className="hourglass-wrapper">
      <svg viewBox="0 0 64 96" className="hourglass-svg" aria-hidden="true">
        <defs>
          <linearGradient id="hg-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="hg-sand-bot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.95" />
          </linearGradient>
          <clipPath id="hg-clip-top">
            <path d="M18,6 L46,6 Q48,6 48,8 L48,34 Q48,38 44,40 L34,45 Q32,46 30,45 L20,40 Q16,38 16,34 L16,8 Q16,6 18,6 Z" />
          </clipPath>
          <clipPath id="hg-clip-bot">
            <path d="M20,51 L30,51 Q32,50 34,51 L44,56 Q48,58 48,62 L48,88 Q48,90 46,90 L18,90 Q16,90 16,88 L16,62 Q16,58 20,56 Z" />
          </clipPath>
        </defs>

        {/* top plate */}
        <rect x="12" y="0" width="40" height="6" rx="3" fill="var(--text-tertiary)" opacity="0.7" />
        {/* bottom plate */}
        <rect x="12" y="90" width="40" height="6" rx="3" fill="var(--text-tertiary)" opacity="0.7" />

        {/* left pillar */}
        <path d="M14,4 L14,92 Q14,94 16,94 L18,94 L18,2 Q16,2 14,4 Z" fill="var(--text-tertiary)" opacity="0.4" />
        {/* right pillar */}
        <path d="M50,4 L50,92 Q50,94 48,94 L46,94 L46,2 Q48,2 50,4 Z" fill="var(--text-tertiary)" opacity="0.4" />

        {/* glass body — top bulb */}
        <path
          d="M18,6 L46,6 Q48,6 48,8 L48,34 Q48,38 44,40 L34,45 Q32,46 30,45 L20,40 Q16,38 16,34 L16,8 Q16,6 18,6 Z"
          fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" opacity="0.5"
        />
        {/* glass body — bottom bulb */}
        <path
          d="M20,51 L30,51 Q32,50 34,51 L44,56 Q48,58 48,62 L48,88 Q48,90 46,90 L18,90 Q16,90 16,88 L16,62 Q16,58 20,56 Z"
          fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" opacity="0.5"
        />

        {/* top sand */}
        {topH > 0.5 && (
          <ellipse
            cx="32" cy={topY + topH / 2}
            rx={6 + (1 - p) * 10} ry={topH / 2}
            fill="url(#hg-sand)" className="sand-top"
          />
        )}

        {/* stream */}
        <line x1="32" y1="45" x2="32" y2="52" stroke="var(--amber)" strokeWidth="1.2" opacity="0.6" className="sand-stream" />

        {/* bottom sand */}
        {botH > 0.5 && (
          <ellipse
            cx="32" cy={botY + botH / 2}
            rx={6 + p * 10} ry={botH / 2}
            fill="url(#hg-sand-bot)" className="sand-bot"
          />
        )}

        {/* glass highlight */}
        <ellipse cx="26" cy="22" rx="3" ry="10" fill="white" opacity="0.06" />
      </svg>
    </div>
  )
}

function TimeScreen() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [])

  const ts = getTimeStatus()
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const hourglassProgress = ts.status === 'active' ? 1 - ts.remainingMs / ts.totalMs : 0

  const clockTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

  if (ts.status === 'weekend') {
    return (
      <>
        <div className="settings-header">
          <h1 className="settings-title">Время</h1>
        </div>
        <div className="time-status-card">
          <Hourglass progress={0} />
          <div className="time-big">{clockTime}</div>
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
          <Hourglass progress={0} />
          <div className="time-big">{clockTime}</div>
          <div className="time-subtitle">Пары закончились</div>
        </div>
      </>
    )
  }

  if (ts.status === 'before' && ts.next) {
    const diff = slotMs(ts.next.startMin) - nowMs
    return (
      <>
        <div className="settings-header">
          <h1 className="settings-title">Время</h1>
        </div>
        <div className="time-status-card before-pair">
          <Hourglass progress={0} />
          <div className="time-big">{fmtCountdown(Math.max(0, diff))}</div>
          <div className="time-current-label">До начала {ts.next.label}</div>
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
        <Hourglass progress={hourglassProgress} />
        <div className="time-big">{fmtCountdown(ts.remainingMs)}</div>
        <div className="time-current-label">
          {isLunch ? 'Обеденный перерыв' : isBreak ? 'Перемена' : pairName}
        </div>
        <div className="time-progress-track">
          <div className="time-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {ts.next && (
          <div className="time-next">
            Далее: {ts.next.label} ({fmtTime(ts.next.startMin)})
          </div>
        )}
      </div>

      <div className="time-timeline">
        {TIMELINE.map((slot, i) => {
          const isCurrent = current && slot.startMin === current.startMin && slot.endMin === current.endMin
          const isPast = nowMs >= slotMs(slot.endMin)
          const isFuture = nowMs < slotMs(slot.startMin)
          return (
            <div
              key={i}
              className={`time-slot ${slot.type} ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
            >
              <div className="time-slot-time">{fmtTime(slot.startMin)}</div>
              <div className="time-slot-bar">
                <div className="time-slot-label">{slot.label}</div>
              </div>
              <div className="time-slot-time">{fmtTime(slot.endMin)}</div>
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
