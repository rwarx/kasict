// Счётчик «Пользователей сегодня»: бесплатный публичный сервис Abacus
// (совместим с CountAPI, без регистрации). Одно устройство = один заход в сутки:
// «+1» отправляется только если сегодня с этого устройства ещё не отправляли.
// Персональные данные не собираются — сервис знает только число за дату.

const BASE = 'https://abacus.jasoncameron.dev'
const NS = 'kasict.proj'

const flagKey = (day: string) => `schedule:visit:${day}`
const valKey = (day: string) => `schedule:visit:value:${day}`

export function todayStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function counterValue(path: string, timeoutMs = 6000): Promise<number | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.value === 'number' ? data.value : null
  } catch {
    return null
  }
}

/** Вызывается один раз при старте приложения: раз в сутки с устройства отправляет «+1». */
export function registerDailyVisit(): void {
  const day = todayStamp()
  let counted = false
  try {
    counted = localStorage.getItem(flagKey(day)) === '1'
  } catch { /* localStorage недоступен — всё равно пробуем отправить */ }
  if (counted) return
  // Флаг ставим сразу (оптимистично): даже если hit не успеет дойти
  // или устройство офлайн — устройство посчитается не более одного раза в сутки.
  try { localStorage.setItem(flagKey(day), '1') } catch { /* ignore */ }
  counterValue(`/hit/${NS}/visit-${day}`).then((v) => {
    if (v == null) return // офлайн или сервис недоступен
    try { localStorage.setItem(valKey(day), String(v)) } catch { /* ignore */ }
  })
}

/** Значение счётчика за сегодня: живое из сервиса, иначе кэш устройства, иначе null. */
export async function fetchTodayVisitors(): Promise<number | null> {
  const day = todayStamp()
  const live = await counterValue(`/get/${NS}/visit-${day}`)
  if (live != null) {
    try { localStorage.setItem(valKey(day), String(live)) } catch { /* ignore */ }
    return live
  }
  try {
    const cached = localStorage.getItem(valKey(day))
    if (cached && /^\d+$/.test(cached)) return Number(cached)
  } catch { /* ignore */ }
  return null
}
