// Индикатор свежести данных: «Обновлено 5 мин назад» + статус (свежие/устаревшие).

import { useEffect, useState } from 'react'

const STALE_MS = 24 * 60 * 60 * 1000 // сутки без обновлений — предупреждение

function relativeLabel(updated: Date, now: Date): string {
  const diff = Math.max(0, now.getTime() - updated.getTime())
  if (diff < 90_000) return 'только что'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours} ч назад`

  const time = updated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(updated, yesterday)) return `вчера в ${time}`
  const date = updated.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return `${date} в ${time}`
}

export function FreshnessIndicator({ updatedAt }: { updatedAt: string | null | undefined }) {
  const [now, setNow] = useState(() => new Date())

  // Раз в минуту обновляем относительное время
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (!updatedAt) return null

  // updated_at пишется без таймзоны — трактуем как локальное время генератора
  const updated = new Date(updatedAt.includes('T') ? updatedAt : updatedAt.replace(' ', 'T'))
  if (Number.isNaN(updated.getTime())) return null

  const stale = now.getTime() - updated.getTime() > STALE_MS
  const exact = updated.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="freshness-wrap">
      <span
        className={`freshness ${stale ? 'stale' : ''}`}
        title={stale ? `Последнее обновление: ${exact}. Данные могут быть устаревшими` : `Последнее обновление: ${exact}`}
      >
        <span className="dot" aria-hidden="true" />
        Обновлено {relativeLabel(updated, now)}
      </span>
    </div>
  )
}
