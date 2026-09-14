// Live-состояние пар: «идёт сейчас» / «уже прошла», прогресс пары.
// Время обновляется каждые 30 сек (и при возврате на вкладку).
// Для отладки/превью можно подменить время: ?now=12:40 или ?now=1240.

import { useEffect, useState } from 'react'

export type LessonLiveState = 'past' | 'now'

export interface LessonLive {
  state: LessonLiveState
  /** 0..1 — какая часть пары прошла */
  progress: number
  /** минут до конца пары (для state = 'now') */
  minutesLeft: number
}

/** «09:35» → 575, иначе null. */
export function parseTimeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function realNowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Текущее время в минутах от полуночи (с учётом превью ?now=HH:MM). */
export function nowMinutes(): number {
  try {
    const v = new URLSearchParams(window.location.search).get('now')
    if (v) {
      const normalized = v.includes(':') ? v : `${v.slice(0, 2)}:${v.slice(2)}`
      const parsed = parseTimeToMinutes(normalized)
      if (parsed !== null) return parsed
    }
  } catch { /* ignore */ }
  return realNowMinutes()
}

/** Состояние пары относительно текущего времени. null — пара ещё не началась. */
export function computeLive(timeStart: string, timeEnd: string, nowMin: number): LessonLive | null {
  const s = parseTimeToMinutes(timeStart)
  const e = parseTimeToMinutes(timeEnd)
  if (s === null || e === null || e <= s) return null
  if (nowMin < s) return null
  if (nowMin >= e) return { state: 'past', progress: 1, minutesLeft: 0 }
  const progress = Math.min(1, Math.max(0, (nowMin - s) / (e - s)))
  return { state: 'now', progress, minutesLeft: Math.max(0, Math.ceil(e - nowMin)) }
}

/** Текущее время (минуты от полуночи), тикает каждые intervalMs. */
export function useNow(intervalMs = 30000): number {
  const [minutes, setMinutes] = useState(() => nowMinutes())

  useEffect(() => {
    const update = () => setMinutes(nowMinutes())
    const id = window.setInterval(update, intervalMs)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [intervalMs])

  return minutes
}
