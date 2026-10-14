import { useMemo, useState } from 'react'
import { getPairTimes, getParity, getTeacherDay, getTeachers, useDataVersion, type TeacherLessonView } from '../services/scheduleService'
import { getWeekDays, shiftISO, todayISO, weekdayName } from '../lib/date'
import { activePairTimes, useShortened } from '../lib/shortened'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon, UserIcon, UsersIcon } from '../components/Icons'

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const STATUS_META: Partial<Record<string, { label: string; kind: string }>> = {
  replaced: { label: 'Замена', kind: 'warn' },
  teacher_changed: { label: 'Преподаватель', kind: 'info' },
  room_changed: { label: 'Кабинет', kind: 'info' },
  added: { label: 'Добавлено', kind: 'success' },
}

function formatPairCount(count: number) {
  if (count === 0) return 'пар нет'
  if (count === 1) return '1 пара'
  if (count >= 2 && count <= 4) return `${count} пары`
  return `${count} пар`
}

function teacherInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
}

function matchesTeacher(name: string, query: string) {
  return name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
}

/** Нормализация для поиска предметов: нижний регистр, ё→е, только буквы и цифры. */
function normText(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^0-9a-zа-я]/g, '')
}

/** Полные названия предметов → аббревиатуры, как они записаны в расписании. */
const SUBJECT_SYNONYMS: Record<string, string[]> = {
  'физкультура': ['физра'],
  'иностранный': ['иняз'],
  'иностранныйязык': ['иняз'],
  'английский': ['иняз'],
  'немецкий': ['иняз'],
  'обж': ['обзр'],
  'безопасность': ['обзр'],
  'безопасностьжизнедеятельности': ['обзр'],
  'основыбезопасности': ['обзр'],
}

/** Токены запроса: сам запрос + аббревиатуры-синонимы (от 2 символов). */
function subjectQueryTokens(query: string): string[] {
  const q = normText(query)
  if (q.length < 2) return []
  return [q, ...(SUBJECT_SYNONYMS[q] ?? [])]
}

/** Совпадение предмета с запросом: «мат» ↔ «мат.», «математика» ↔ «мат.», «физра» ↔ «физ-ра». */
function subjectMatchesQuery(subject: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const whole = normText(subject)
  if (!whole) return false
  const words = subject.split(/[^0-9a-zа-яё]+/i).map(normText).filter(Boolean)
  const candidates = new Set<string>([whole, ...words])
  for (const token of tokens) {
    for (const candidate of candidates) {
      if (candidate === token) return true
      if (candidate.includes(token)) return true
      // аббревиатура предмета — начало полного названия («мат» → «математика»)
      if (candidate.length >= 3 && token.startsWith(candidate)) return true
    }
  }
  return false
}

/** Уникальные предметы преподавателя: сначала частые, затем по алфавиту. */
function teacherSubjects(entries: import('../parser/types').TeacherEntry[]): string[] {
  const counts = new Map<string, number>()
  entries.forEach(entry => {
    const subject = (entry.subject || '').trim()
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1)
  })
  return [...counts.keys()].sort((a, b) =>
    (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'ru'))
}

export function TeachersScreen({ dateISO, setDateISO }: {
  dateISO: string
  setDateISO: (s: string) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const teachers = getTeachers()
  const names = useMemo(() => Object.keys(teachers).sort((a, b) => a.localeCompare(b, 'ru')), [teachers])
  const subjectsByTeacher = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const name of names) map.set(name, teacherSubjects(teachers[name] ?? []))
    return map
  }, [names, teachers])
  const filtered = useMemo(() => {
    const raw = query.trim()
    if (!raw) return names
    const tokens = subjectQueryTokens(raw)
    const rows: { name: string; rank: number }[] = []
    for (const name of names) {
      const viaName = matchesTeacher(name, raw)
      const viaSubject = !viaName && tokens.length > 0
        && (subjectsByTeacher.get(name) ?? []).some(subject => subjectMatchesQuery(subject, tokens))
      if (viaName || viaSubject) rows.push({ name, rank: viaName ? 0 : 1 })
    }
    return rows
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ru'))
      .map(row => row.name)
  }, [names, query, subjectsByTeacher])

  /** Предметы преподавателя, совпавшие с запросом (для подсказки на карточке). */
  const matchedSubjectsFor = (name: string): string[] => {
    const tokens = subjectQueryTokens(query)
    if (tokens.length === 0) return []
    return (subjectsByTeacher.get(name) ?? []).filter(subject => subjectMatchesQuery(subject, tokens))
  }
  const entries = selected ? teachers[selected] ?? [] : []
  const dataVersion = useDataVersion()
  const [shortened] = useShortened()
  const pairTimes = activePairTimes(getPairTimes())
  const weekDays = useMemo(() => getWeekDays(dateISO), [dateISO])
  const weekStart = new Date(weekDays[0] + 'T12:00:00')
  const weekEnd = new Date(weekDays[6] + 'T12:00:00')
  const isCurrentWeek = weekDays.includes(todayISO())

  // Неделя преподавателя с применёнными заменами (как в групповом расписании).
  const weekLessons = useMemo(() => {
    const map = new Map<string, TeacherLessonView[]>()
    if (!selected) return map
    for (const date of weekDays) {
      map.set(date, getTeacherDay(selected, new Date(date + 'T12:00:00')))
    }
    return map
  }, [selected, weekDays, dataVersion, shortened])

  return (
    <>
      <section className="date-hero teacher-hero">
        <div className="date-eyebrow">Расписание</div>
        <h1 className="date-title">Учителя</h1>
        <p className="teacher-intro">Найдите преподавателя по имени или предмету и посмотрите его пары по группам.</p>
      </section>

      <div className="teacher-search-wrap">
        <SearchIcon size={19} />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Поиск по имени или предмету"
          aria-label="Поиск преподавателя или предмета"
        />
        {query && (
          <button type="button" className="teacher-search-clear" onClick={() => setQuery('')} aria-label="Очистить поиск">
            <CloseIcon size={16} />
          </button>
        )}
      </div>

      {!selected ? (
        <section className="teacher-directory animate-in">
          <div className="teacher-section-heading">
            <div>
              <h2>Все преподаватели</h2>
              <span>{filtered.length} из {names.length}</span>
            </div>
            <UsersIcon size={20} />
          </div>
          {filtered.length === 0 ? (
            <div className="teacher-empty">
              <UserIcon size={28} />
              <strong>Ничего не найдено</strong>
              <span>Попробуйте фамилию или предмет иначе.</span>
            </div>
          ) : (
            <div className="teacher-grid">
              {filtered.map(name => {
                const matched = matchedSubjectsFor(name)
                const matchedLabel = matched.length > 3
                  ? `${matched.slice(0, 3).join(' · ')} +${matched.length - 3}`
                  : matched.join(' · ')
                return (
                  <button key={name} type="button" className="teacher-person" onClick={() => setSelected(name)}>
                    <span className="teacher-avatar">{teacherInitials(name)}</span>
                    <span className="teacher-person-copy">
                      <strong>{name}</strong>
                      <small>{matchedLabel || formatPairCount(teachers[name].filter(entry => entry.subject).length)}</small>
                    </span>
                    <ChevronRightIcon size={16} />
                  </button>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="teacher-schedule animate-in">
          <button type="button" className="teacher-back" onClick={() => setSelected(null)}>
            <ChevronLeftIcon size={17} /> Все преподаватели
          </button>

          <div className="teacher-profile-card">
            <span className="teacher-avatar large">{teacherInitials(selected)}</span>
            <div>
              <div className="date-eyebrow">Преподаватель</div>
              <h2>{selected}</h2>
              <span>{formatPairCount(entries.filter(entry => entry.subject).length)} в общем расписании</span>
              {(subjectsByTeacher.get(selected) ?? []).length > 0 && (
                <div className="teacher-subjects" aria-label="Предметы преподавателя">
                  {(subjectsByTeacher.get(selected) ?? []).map(subject => (
                    <span key={subject} className="teacher-subject-chip">{subject}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="quick-nav teacher-week-nav">
            <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, -7))} aria-label="Предыдущая неделя">
              <ChevronLeftIcon size={16} />
            </button>
            <div className="quick-seg">
              <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(todayISO(), -7))}>Прошлая</button>
              <button type="button" className={`quick-chip ${isCurrentWeek ? 'current' : ''}`} onClick={() => setDateISO(todayISO())}>Текущая</button>
              <button type="button" className="quick-chip" onClick={() => setDateISO(shiftISO(todayISO(), 7))}>Следующая</button>
            </div>
            <button type="button" className="quick-arrow" onClick={() => setDateISO(shiftISO(dateISO, 7))} aria-label="Следующая неделя">
              <ChevronRightIcon size={16} />
            </button>
          </div>

          <div className="teacher-week-label">
            {weekStart.getDate()} {MONTHS_GEN[weekStart.getMonth()]} — {weekEnd.getDate()} {MONTHS_GEN[weekEnd.getMonth()]}
          </div>

          <div className="teacher-days">
            {weekDays.map((date) => {
              const rows = weekLessons.get(date) ?? []
              const activeCount = rows.filter(row => row.status !== 'cancelled').length
              const hasReplacements = rows.some(row => row.status !== 'normal')
              const currentParity = getParity(new Date(date + 'T12:00:00'))
              const parityLabel = currentParity === 'odd' ? 'Нечётная' : currentParity === 'even' ? 'Чётная' : ''
              return (
                <section key={date} className="teacher-day">
                  <div className="teacher-day-header">
                    <div>
                      <strong>{weekdayName(date)}</strong>
                      <span>{new Date(date + 'T12:00:00').getDate()} · {formatPairCount(activeCount)}</span>
                    </div>
                    {date === todayISO() && <span className="badge accent">Сегодня</span>}
                    {hasReplacements && date !== todayISO() && <span className="badge warn">Замены</span>}
                  </div>
                  {rows.length === 0 ? (
                    <div className="teacher-day-empty">Пар нет</div>
                  ) : (
                    <div className="teacher-lessons">
                      {rows.map((row, rowIndex) => {
                        const cancelled = row.status === 'cancelled'
                        const statusMeta = STATUS_META[row.status]
                        return (
                          <div key={`${row.group}-${row.number}-${rowIndex}`} className={`teacher-lesson ${cancelled ? 'cancelled' : ''}`}>
                            <div className="teacher-lesson-time">
                              <strong>#{row.number}</strong>
                              <span>{pairTime(row.number, pairTimes)}</span>
                            </div>
                            <div className="teacher-lesson-copy">
                              <strong>{cancelled ? <s>{row.original?.subject || row.subject || '—'}</s> : row.subject}</strong>
                              <span>
                                {row.group}
                                {cancelled ? ' · Отменено' : row.is_remote ? ' · Дистанционно' : row.classroom ? ` · ${row.classroom} каб.` : ''}
                              </span>
                            </div>
                            {statusMeta && !cancelled ? (
                              <span className={`badge ${statusMeta.kind}`}>{statusMeta.label}</span>
                            ) : (
                              <span className="teacher-parity">{parityLabel}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

function pairTime(pair: number, times: Record<string, [string, string]>) {
  const t = times[String(pair)]
  return t ? `${t[0]}–${t[1]}` : 'Время уточняется'
}
