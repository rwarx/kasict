// Особые дни: День X — 18 сентября каждого года.

export const DAY_X_MONTH = 9 // сентябрь
export const DAY_X_DAY = 18

const DAY_X_FIREWORKS_KEY = 'schedule:dayxFireworks'

/** ISO-дата Дня X для указанного года (по умолчанию — текущего). */
export function dayXISO(year: number = new Date().getFullYear()): string {
  return `${year}-${String(DAY_X_MONTH).padStart(2, '0')}-${String(DAY_X_DAY).padStart(2, '0')}`
}

/** Является ли ISO-дата Днём X (18 сентября любого года). */
export function isDayX(dateISO: string): boolean {
  const parts = dateISO.split('-')
  return Number(parts[1]) === DAY_X_MONTH && Number(parts[2]) === DAY_X_DAY
}

/** Ближайший День X: в этом году или в следующем. */
export function nextDayXISO(from: Date = new Date()): string {
  const y = from.getFullYear()
  const thisYear = new Date(dayXISO(y) + 'T12:00:00')
  return from.getTime() > thisYear.getTime() ? dayXISO(y + 1) : dayXISO(y)
}

/** Сколько дней осталось до ближайшего Дня X (0 = сегодня). */
export function daysUntilDayX(from: Date = new Date()): number {
  const target = new Date(nextDayXISO(from) + 'T12:00:00')
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

/** Включён ли фейерверк (переключается в настройках; по умолчанию — включён). */
export function isDayXFireworksEnabled(): boolean {
  try {
    return localStorage.getItem(DAY_X_FIREWORKS_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setDayXFireworksEnabled(on: boolean): void {
  try {
    localStorage.setItem(DAY_X_FIREWORKS_KEY, on ? 'on' : 'off')
  } catch {
    /* приватный режим — просто игнорируем */
  }
}

/**
 * Режим предпросмотра для отладки/демо: ?dayx=1 — принудительно показать,
 * ?dayx=0 — принудительно скрыть. Без параметра — по реальной дате.
 */
export function dayXPreviewMode(): 'on' | 'off' | null {
  try {
    const v = new URLSearchParams(window.location.search).get('dayx')
    if (v === '1') return 'on'
    if (v === '0') return 'off'
  } catch {
    /* noop */
  }
  return null
}

/** Показывать ли сегодня День X с учётом режима предпросмотра. */
export function shouldCelebrateDayX(todayISOValue: string): boolean {
  const mode = dayXPreviewMode()
  if (mode === 'on') return true
  if (mode === 'off') return false
  return isDayX(todayISOValue)
}
