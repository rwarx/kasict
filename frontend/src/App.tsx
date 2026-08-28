import { useEffect, useMemo, useState } from 'react'
import { getDay, getGroups, getMeta, getTeachers, loadData } from './services/scheduleService'
import type { DaySchedule, LessonView } from './services/replacementEngine'
import type { TeacherEntry } from './parser/types'

const GROUP_KEY = 'schedule:group'
const NOTIF_KEY = 'schedule:notifications'

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
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

const DAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

type Screen = 'schedule' | 'teachers' | 'settings'

export default function App() {
  const [group, setGroup] = useState<string | null>(() => localStorage.getItem(GROUP_KEY))
  const [dateISO, setDateISO] = useState(todayISO())
  const [screen, setScreen] = useState<Screen>('schedule')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
      .then(() => setLoading(false))
      .catch(() => { setError('Не удалось загрузить данные'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading">
          <div className="spinner" />
          Загрузка…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="main-content">
        <div className="header"><h1>Расписание</h1></div>
        <p className="error">{error}</p>
      </div>
    )
  }

  return (
    <>
      <div className="main-content">
        {screen === 'schedule' && (
          group
            ? <ScheduleScreen group={group} dateISO={dateISO} setDateISO={setDateISO}
                              onChangeGroup={() => { localStorage.removeItem(GROUP_KEY); setGroup(null) }} />
            : <GroupPicker onPick={(g) => { localStorage.setItem(GROUP_KEY, g); setGroup(g) }} />
        )}
        {screen === 'teachers' && <TeachersScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </div>

      <nav className="bottom-nav">
        <button className={`nav-item ${screen === 'schedule' ? 'active' : ''}`}
                onClick={() => setScreen('schedule')}>
          <span className="nav-icon">📅</span>
          Расписание
        </button>
        <button className={`nav-item ${screen === 'teachers' ? 'active' : ''}`}
                onClick={() => setScreen('teachers')}>
          <span className="nav-icon">👨‍🏫</span>
          Учителя
        </button>
        <button className={`nav-item ${screen === 'settings' ? 'active' : ''}`}
                onClick={() => setScreen('settings')}>
          <span className="nav-icon">⚙️</span>
          Настройки
        </button>
      </nav>
    </>
  )
}

/* ==================== GROUP PICKER ==================== */

function GroupPicker({ onPick }: { onPick: (g: string) => void }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => getGroups(), [])

  const filtered = useMemo(
    () => groups.filter(g => g.name.toLowerCase().replace(/\s|-/g, '').includes(query.toLowerCase().replace(/\s|-/g, ''))),
    [groups, query],
  )

  return (
    <>
      <div className="header">
        <h1>Расписание</h1>
        <p className="header-sub">Выберите группу</p>
      </div>
      <input className="search" placeholder="Поиск группы…" value={query}
             onChange={e => setQuery(e.target.value)} autoFocus />
      <ul className="group-list">
        {filtered.map(g => (
          <li key={g.name}>
            <button className="group-btn" onClick={() => onPick(g.name)}>{g.name}</button>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ==================== SCHEDULE SCREEN ==================== */

function ScheduleScreen({ group, dateISO, setDateISO, onChangeGroup }: {
  group: string; dateISO: string; setDateISO: (s: string) => void; onChangeGroup: () => void
}) {
  const [day, setDay] = useState<DaySchedule | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    setDay(getDay(group, new Date(dateISO + 'T12:00:00')))
    setExpanded(null)
  }, [group, dateISO])

  const isToday = dateISO === todayISO()
  const visible = day?.lessons.filter(l => l.status === 'cancelled' || l.subject) ?? []

  return (
    <>
      <div className="header">
        <div className="group-selector" onClick={onChangeGroup}>
          <span className="group-name">{group}</span>
          <span className="group-label">изменить</span>
        </div>
      </div>

      <div className="date-nav">
        <button className="date-btn" onClick={() => setDateISO(shiftISO(dateISO, -1))}>←</button>
        <div className="date-center">
          <div className="date-weekday">{day?.weekday}</div>
          <div className="date-full">{formatDateRU(dateISO)}</div>
          {!isToday && <button className="date-today-btn" onClick={() => setDateISO(todayISO())}>Сегодня</button>}
        </div>
        <button className="date-btn" onClick={() => setDateISO(shiftISO(dateISO, 1))}>→</button>
      </div>
      <input type="date" className="date-picker" value={dateISO}
             onChange={e => e.target.value && setDateISO(e.target.value)} />

      {day?.parity && (
        <span className={`parity-badge ${day.parity}`}>{day.parity_label}</span>
      )}

      {day?.day_note && <div className="day-note">📌 {day.day_note}</div>}
      {day?.has_replacements && !day.day_note && (
        <div className="day-note warn">⚠ Есть замены</div>
      )}
      {day?.warnings.map((w, i) => <p key={i} className="warning">{w}</p>)}

      {visible.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🎉</div>
          Пар нет
        </div>
      )}

      <div className="lessons">
        {visible.map(l => (
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
    </>
  )
}

function LessonCard({ lesson, expanded, onToggle }: {
  lesson: LessonView; expanded: boolean; onToggle: () => void
}) {
  const hasChange = lesson.status !== 'normal'
  return (
    <div className={`lesson ${lesson.status} ${hasChange ? 'lesson-clickable' : ''}`}
         onClick={hasChange ? onToggle : undefined}>
      <div className="lesson-head">
        <span className="pair-num">{lesson.number}</span>
        <span className="pair-time">{lesson.time_start} — {lesson.time_end}</span>
        {lesson.status === 'cancelled' && <span className="badge cancel">Отмена</span>}
        {lesson.status === 'added' && <span className="badge added">+ Доп. пара</span>}
        {lesson.status === 'replaced' && <span className="badge replaced">Замена</span>}
        {lesson.status === 'teacher_changed' && <span className="badge teacher">Учитель</span>}
        {lesson.status === 'room_changed' && <span className="badge room">Кабинет</span>}
      </div>
      {lesson.status !== 'cancelled' && (
        <>
          <div className="subject">{lesson.subject || '—'}</div>
          <div className="meta">
            {lesson.is_remote ? '💻 Дистанционно' : lesson.classroom && `Каб. ${lesson.classroom}`}
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

/* ==================== TEACHERS SCREEN ==================== */

function TeachersScreen() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const teachers = useMemo(() => getTeachers(), [])

  const names = useMemo(() => Object.keys(teachers).sort(), [teachers])

  const filtered = useMemo(
    () => names.filter(n => n.toLowerCase().includes(query.toLowerCase())),
    [names, query],
  )

  if (selected) {
    return <TeacherSchedule name={selected} entries={teachers[selected] || []} onBack={() => setSelected(null)} />
  }

  return (
    <>
      <div className="header">
        <h1>Учителя</h1>
        <p className="header-sub">{names.length} преподавателей</p>
      </div>
      <input className="search" placeholder="Поиск учителя…" value={query}
             onChange={e => setQuery(e.target.value)} />
      <ul className="teacher-list">
        {filtered.map(name => (
          <li key={name}>
            <button className="teacher-btn" onClick={() => setSelected(name)}>
              <span className="teacher-avatar">{name.charAt(0)}</span>
              <span className="teacher-info">
                <span className="teacher-name">{name}</span>
                <span className="teacher-count">{teachers[name].length} пар</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function TeacherSchedule({ name, entries, onBack }: {
  name: string; entries: TeacherEntry[]; onBack: () => void
}) {
  const grouped = useMemo(() => {
    const map: Record<number, TeacherEntry[]> = {}
    for (const e of entries) {
      (map[e.weekday] ??= []).push(e)
    }
    return map
  }, [entries])

  return (
    <>
      <div className="header">
        <button className="date-today-btn" onClick={onBack}>← Назад</button>
        <h1 style={{ marginTop: 8 }}>{name}</h1>
        <p className="header-sub">{entries.length} пар в неделю</p>
      </div>
      {[0, 1, 2, 3, 4, 5].map(wd => {
        const dayEntries = grouped[wd]
        if (!dayEntries?.length) return null
        return (
          <div key={wd}>
            <div className="teacher-day-header">{DAY_NAMES[wd]}</div>
            <div className="lessons">
              {dayEntries.sort((a, b) => a.pair - b.pair).map((e, i) => (
                <div key={i} className="lesson">
                  <div className="lesson-head">
                    <span className="pair-num">{e.pair}</span>
                    <span className="pair-time">{e.subject}</span>
                  </div>
                  <div className="meta">
                    {e.group} · каб. {e.classroom} · {e.parity === 'odd' ? 'числ.' : 'знам.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

/* ==================== SETTINGS SCREEN ==================== */

function SettingsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(() => {
    return localStorage.getItem(NOTIF_KEY) === 'true'
  })

  const meta = getMeta()

  const toggleNotif = async () => {
    if (!notifEnabled) {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      localStorage.setItem(NOTIF_KEY, 'true')
      setNotifEnabled(true)
    } else {
      localStorage.removeItem(NOTIF_KEY)
      setNotifEnabled(false)
    }
  }

  return (
    <>
      <div className="header">
        <h1>Настройки</h1>
      </div>

      <div className="settings-section">
        <div className="settings-title">Уведомления</div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">Напоминание о парах</div>
              <div className="settings-desc">За 30 минут до первой пары</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={notifEnabled} onChange={toggleNotif} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">Информация</div>
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">Групп</span>
            <span className="info-value">{meta?.groups_count ?? '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Обновлено</span>
            <span className="info-value">
              {meta?.updated_at ? new Date(meta.updated_at).toLocaleString('ru-RU') : '—'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Замены на</span>
            <span className="info-value">
              {meta?.replacement_dates?.join(', ') || 'нет'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Источник</span>
            <span className="info-value">kasict.ru</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">Приложение</div>
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">Версия</span>
            <span className="info-value">1.0.0</span>
          </div>
          <div className="info-row">
            <span className="info-label">PWA</span>
            <span className="info-value">Установлено</span>
          </div>
        </div>
      </div>
    </>
  )
}
