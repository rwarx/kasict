// Индикатор свежести данных: «Обновлено 5 мин назад» + статус (свежие/устаревшие).
// Тап по индикатору — ручная проверка замен (если передан onRefresh).

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

export function FreshnessIndicator({ updatedAt, onRefresh }: {
  updatedAt: string | null | undefined
  onRefresh?: () => Promise<void> | void
}) {
  const [now, setNow] = useState(() => new Date())
  const [checking, setChecking] = useState(false)

  // Раз в минуту обновляем относительное время
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Минимальная длительность состояния «Проверяем…», чтобы тап был заметен
  const runCheck = () => {
    if (!onRefresh || checking) return
    setChecking(true)
    const started = Date.now()
    void Promise.resolve(onRefresh()).finally(() => {
      const wait = Math.max(0, 700 - (Date.now() - started))
      window.setTimeout(() => setChecking(false), wait)
    })
  }

  if (!updatedAt) return null

  // updated_at пишется без таймзоны — трактуем как локальное время генератора
  const updated = new Date(updatedAt.includes('T') ? updatedAt : updatedAt.replace(' ', 'T'))
  if (Number.isNaN(updated.getTime())) return null

  const stale = now.getTime() - updated.getTime() > STALE_MS
  const exact = updated.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  const label = checking
    ? 'Проверяем замены…'
    : `Обновлено ${relativeLabel(updated, now)}`

  return (
    <div className="freshness-wrap">
      <span
        className={`freshness ${stale ? 'stale' : ''} ${onRefresh ? 'clickable' : ''}`}
        title={stale
          ? `Последнее обновление: ${exact}. Данные могут быть устаревшими${onRefresh ? '. Нажмите, чтобы проверить' : ''}`
          : `Последнее обновление: ${exact}${onRefresh ? '. Нажмите, чтобы проверить замены' : ''}`}
        {...(onRefresh
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': checking ? 'Проверяем замены' : 'Проверить обновления расписания',
              onClick: runCheck,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  runCheck()
                }
              },
            }
          : {})}
      >
        <span className={`dot ${checking ? 'checking' : ''}`} aria-hidden="true" />
        {label}
      </span>
    </div>
  )
}
