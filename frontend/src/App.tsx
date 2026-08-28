import { useEffect, useMemo, useState } from 'react'
import { getDay, getGroups, loadData } from './services/scheduleService'
import type { DaySchedule, LessonView } from './services/replacementEngine'

const GROUP_KEY = 'schedule:group'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateRU(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
}

export default function App() {
  const [group, setGroup] = useState<string | null>(() => localStorage.getItem(GROUP_KEY))
  const [dateISO, setDateISO] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
      .then(() => setLoading(false))
      .catch(() => {
        setError('Не удалось загрузить данные. Проверьте подключение.')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="container">
        <h1>📚 Расписание</h1>
        <p className="muted">Загрузка данных…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <h1>📚 Расписание</h1>
        <p className="error">{error}</p>
      </div>
    )
  }

  if (!group) {
    return <GroupPicker onPick={(g) => { localStorage.setItem(GROUP_KEY, g); setGroup(g) }} />
  }
  return <DayView group={group} dateISO={dateISO} setDateISO={setDateISO}
                  onChangeGroup={() => { localStorage.removeItem(GROUP_KEY); setGroup(null) }} />
}

function GroupPicker({ onPick }: { onPick: (g: string) => void }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => getGroups(), [])

  const filtered = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().replace(/\s|-/g, '').includes(query.toLowerCase().replace(/\s|-/g, ''))),
    [groups, query],
  )

  return (
    <div className="container">
      <h1>📚 Расписание</h1>
      <p className="muted">Выберите свою учебную группу — она запомнится.</p>
      <input
        className="search"
        placeholder="Поиск группы…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <ul className="group-list">
        {filtered.map((g) => (
          <li key={g.name}>
            <button className="group-btn" onClick={() => onPick(g.name)}>{g.name}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DayView({ group, dateISO, setDateISO, onChangeGroup }: {
  group: string
  dateISO: string
  setDateISO: (iso: string) => void
  onChangeGroup: () => void
}) {
  const [day, setDay] = useState<DaySchedule | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    const d = new Date(dateISO + 'T12:00:00')
    const result = getDay(group, d)
    setDay(result)
    setExpanded(null)
  }, [group, dateISO])

  const isToday = dateISO === todayISO()
  const visible = day?.lessons.filter((l) => l.status === 'cancelled' || l.subject) ?? []

  return (
    <div className="container">
      <header className="topbar">
        <button className="link-btn" onClick={onChangeGroup}>✏️ {group}</button>
        <span className="muted small">{day?.parity_label ?? ''}</span>
      </header>

      <div className="date-nav">
        <button className="nav-btn" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Вчера">←</button>
        <div className="date-center">
          <strong className="capitalize">{formatDateRU(dateISO)}</strong>
          {!isToday && <button className="link-btn" onClick={() => setDateISO(todayISO())}>Сегодня</button>}
        </div>
        <button className="nav-btn" onClick={() => setDateISO(shiftISO(dateISO, 1))} aria-label="Завтра">→</button>
      </div>
      <input
        type="date"
        className="date-picker"
        value={dateISO}
        onChange={(e) => e.target.value && setDateISO(e.target.value)}
      />

      {day?.day_note && <div className="day-note">📌 Весь день: {day.day_note}</div>}
      {day?.has_replacements && !day.day_note && (
        <div className="day-note warn">⚠ В этот день есть замены</div>
      )}
      {day?.warnings.map((w, i) => <p key={i} className="warning">{w}</p>)}

      {visible.length === 0 && (
        <p className="empty">🎉 Пар нет — можно отдыхать</p>
      )}

      <div className="lessons">
        {visible.map((l) => (
          <LessonCard key={l.number} lesson={l}
                      expanded={expanded === l.number}
                      onToggle={() => setExpanded(expanded === l.number ? null : l.number)} />
        ))}
      </div>

      {day?.updated_at && (
        <p className="muted small footer">
          Обновлено: {new Date(day.updated_at).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  )
}

function LessonCard({ lesson, expanded, onToggle }: {
  lesson: LessonView
  expanded: boolean
  onToggle: () => void
}) {
  const hasChange = lesson.status !== 'normal'
  const cls = `lesson ${lesson.status}`
  return (
    <div className={cls} onClick={hasChange ? onToggle : undefined} role={hasChange ? 'button' : undefined}>
      <div className="lesson-head">
        <span className="pair-num">{lesson.number}</span>
        <span className="pair-time">{lesson.time_start} — {lesson.time_end}</span>
        {lesson.status === 'cancelled'
          ? <span className="badge cancel">❌ Пара отменена</span>
          : lesson.status === 'added'
            ? <span className="badge added">➕ Доп. пара</span>
            : lesson.status === 'teacher_changed'
              ? <span className="badge teacher">👩‍🏫 Смена преподавателя</span>
              : lesson.status === 'room_changed'
                ? <span className="badge room">🏫 Смена кабинета</span>
                : hasChange && <span className="badge">⚠ Замена</span>}
      </div>

      {lesson.status !== 'cancelled' && (
        <>
          <div className="subject">{lesson.subject || '—'}</div>
          <div className="meta">
            {lesson.is_remote ? '💻 Дистанционно' : lesson.classroom && <>Каб. {lesson.classroom}</>}
            {lesson.teacher && ` · ${lesson.teacher}`}
          </div>
        </>
      )}

      {expanded && hasChange && lesson.original && (
        <div className="original">
          <div className="orig-title">Изменение</div>
          <div className="orig-block">
            <div className="muted small">Было:</div>
            <div>{lesson.original.subject || '—'}{lesson.original.classroom && ` · каб. ${lesson.original.classroom}`}{lesson.original.teacher && ` · ${lesson.original.teacher}`}</div>
            <div className="muted small">Стало:</div>
            <div>{lesson.subject || '—'}{lesson.classroom && ` · каб. ${lesson.classroom}`}{lesson.teacher && ` · ${lesson.teacher}`}</div>
          </div>
        </div>
      )}
    </div>
  )
}
