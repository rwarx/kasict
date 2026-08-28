// Типы JSON-файлов, генерируемых scripts/generate_data.py

export interface LessonData {
  subject: string
  teacher: string
  classroom: string
}

export interface PairData {
  odd?: LessonData
  even?: LessonData
}

export interface TeacherEntry {
  group: string
  weekday: number
  pair: number
  subject: string
  classroom: string
  parity: string
}

export interface ScheduleJSON {
  groups: Record<string, { name: string; number: number }>
  lessons: Record<string, Record<string, Record<string, PairData>>>
  teachers: Record<string, TeacherEntry[]>
  pair_times: Record<string, [string, string]>
  pair_numbers: number[]
}

export interface ReplacementEntry {
  group: string
  lesson_numbers: number[]
  subject: string
  teacher: string
  classroom: string
  is_cancel: boolean
  raw_pairs: string
}

export interface ReplacementBlockJSON {
  date: string
  parity: 'odd' | 'even' | null
  day_word: string
  replacements: ReplacementEntry[]
}

export interface MetaJSON {
  updated_at: string
  groups_count: number
  replacement_dates: string[]
  raspisanie_url: string
  zamena_url: string
}
