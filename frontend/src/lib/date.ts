// Date helpers ( логика переключения дат сохранена из App.tsx )

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekDays(centerISO: string): string[] {
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

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const DAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const WEEKDAY_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

export function weekdayIndexOf(iso: string): number {
  return (new Date(iso + 'T12:00:00').getDay() + 6) % 7
}

export function weekdayName(iso: string): string {
  return WEEKDAY_FULL[weekdayIndexOf(iso)]
}

export function formatDateFull(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${weekdayName(iso)}`
}

export function formatDateShort(iso: string): { name: string; num: number } {
  const d = new Date(iso + 'T12:00:00')
  return { name: DAY_SHORT[d.getDay()], num: d.getDate() }
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_NOM[month]} ${year}`
}

export interface CalendarCell {
  iso: string
  day: number
  inMonth: boolean
}

export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7 // 0 = Monday
  const cells: CalendarCell[] = []
  const start = new Date(first)
  start.setDate(first.getDate() - lead)
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    })
  }
  return cells
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}
