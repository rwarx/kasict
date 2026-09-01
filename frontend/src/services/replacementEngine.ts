// Replacement Engine: применение замен к основному расписанию.

import type { LessonData, PairData, ReplacementBlockJSON, ReplacementEntry, ScheduleJSON } from '../parser/types'

export type LessonStatus = 'normal' | 'replaced' | 'teacher_changed' | 'room_changed' | 'cancelled' | 'added'

export interface LessonView {
  number: number
  time_start: string
  time_end: string
  subject: string
  teacher: string
  classroom: string
  is_remote: boolean
  status: LessonStatus
  original: { subject: string; teacher: string; classroom: string } | null
}

export interface DaySchedule {
  group: string
  date: string
  weekday: string
  parity: 'odd' | 'even'
  parity_label: string
  day_note: string | null
  has_replacements: boolean
  lessons: LessonView[]
  warnings: string[]
  updated_at: string | null
}

const PAIR_NUMBERS = [1, 2, 3, 4, 5, 6]

const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

function isRemote(classroom: string): boolean {
  return /^(до|do\.?)$/i.test(classroom.trim())
}

function classify(base: LessonData | null, rep: ReplacementEntry): LessonStatus {
  if (!base || !base.subject) return 'added'
  const changed: string[] = []
  if (base.subject !== rep.subject) changed.push('subject')
  if (base.teacher !== rep.teacher) changed.push('teacher')
  if (base.classroom !== rep.classroom) changed.push('classroom')
  if (changed.includes('subject')) return 'replaced'
  if (changed.includes('teacher')) return 'teacher_changed'
  if (changed.includes('classroom')) return 'room_changed'
  return 'normal'
}

function lessonFromPair(pair: PairData | undefined, parity: string): LessonData | null {
  if (!pair) return null
  const lesson = parity === 'odd' ? pair.odd : pair.even
  if (!lesson || !lesson.subject) return null
  return lesson
}

export function applyDay(
  schedule: ScheduleJSON,
  group: string,
  d: Date,
  parity: string,
  blocks: ReplacementBlockJSON[],
  updatedAt: string | null,
): DaySchedule {
  const weekdayNum = (d.getDay() + 6) % 7 // JS Sun=0 → our 6 (0=Mon..6=Sun)
  const groupLessons = schedule.lessons[group]
  const dayPairs = groupLessons?.[String(weekdayNum)] || {}

  const pairTimes = schedule.pair_times
  const daySchedule: DaySchedule = {
    group,
    date: d.toISOString().slice(0, 10),
    weekday: DAY_NAMES[weekdayNum],
    parity: parity as 'odd' | 'even',
    parity_label: parity === 'odd' ? 'Числитель' : 'Знаменатель',
    day_note: null,
    has_replacements: false,
    lessons: [],
    warnings: [],
    updated_at: updatedAt,
  }

  // Build base lessons
  const views: Record<number, LessonView> = {}
  const originals: Record<number, LessonData | null> = {}
  for (const p of PAIR_NUMBERS) {
    const pair = dayPairs[String(p)]
    const base = lessonFromPair(pair, parity)
    originals[p] = base
    const t = pairTimes[String(p)] || ['?', '?']
    views[p] = {
      number: p,
      time_start: t[0],
      time_end: t[1],
      subject: base?.subject || '',
      teacher: base?.teacher || '',
      classroom: base?.classroom || '',
      is_remote: base ? isRemote(base.classroom) : false,
      status: 'normal',
      original: null,
    }
  }

  // Find replacements for this date
  const dateStr = d.toISOString().slice(0, 10)
  const dayBlocks = blocks.filter(b => b.date === dateStr)

  for (const block of dayBlocks) {
    for (const rep of block.replacements) {
      if (rep.group !== group) continue

      const targets = rep.lesson_numbers.length > 0 ? rep.lesson_numbers : PAIR_NUMBERS
      let groupChanged = false

      for (const p of targets) {
        if (!(p in views)) {
          daySchedule.warnings.push(`Некорректный номер пары ${p} в замене для «${rep.group}»`)
          continue
        }

        if (rep.is_cancel) {
          views[p] = {
            ...views[p],
            subject: '',
            teacher: '',
            classroom: '',
            is_remote: false,
            status: 'cancelled',
            original: originals[p] ? { ...originals[p]! } : null,
          }
          groupChanged = true
          continue
        }

        const base = originals[p]
        const status = classify(base, rep)
        views[p] = {
          ...views[p],
          subject: rep.subject,
          teacher: rep.teacher,
          classroom: rep.classroom,
          is_remote: isRemote(rep.classroom),
          status,
          original: base ? { ...base } : null,
        }
        if (status !== 'normal') groupChanged = true
      }

      if (groupChanged && rep.lesson_numbers.length === 0 && rep.subject) {
        daySchedule.day_note = rep.subject.slice(0, 60)
      }
    }
  }

  daySchedule.lessons = PAIR_NUMBERS.map(p => views[p])
  daySchedule.has_replacements = daySchedule.lessons.some(l => l.status !== 'normal') || !!daySchedule.day_note
  return daySchedule
}
