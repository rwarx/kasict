// Экран «Время»: что идёт сейчас, обратный отсчёт, таймлайн дня.
// Логика слотов и отсчёта перенесена из исходного App.tsx без изменений.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

function toMin(h: number, m: number) { return h * 60 + m }

interface Slot {
  type: 'pair' | 'pair_break' | 'break' | 'lunch'
  label: string
  startMin: number
  endMin: number
  pairNum?: number
}

const TIMELINE: Slot[] = (() => {
  const PAIRS: [number, number, number, number][] = [
    [8, 0, 9, 35],
    [9, 45, 11, 20],
    [11, 45, 13, 20],
    [13, 45, 15, 20],
    [15, 30, 17, 5],
    [17, 15, 18, 50],
  ]
  const LUNCH_AFTER = [2, 3]
  const PAIR_BREAK_MIN = 5
  const result: Slot[] = []

  for (let i = 0; i < PAIRS.length; i++) {
    const num = i + 1
    const [sh, sm, eh, em] = PAIRS[i]
    const startMin = toMin(sh, sm)
    const endMin = toMin(eh, em)
    const totalMin = endMin - startMin
    const halfMin = (totalMin - PAIR_BREAK_MIN) / 2

    // Первая половина пары
    result.push({ type: 'pair', label: `${num} пара`, startMin, endMin: startMin + halfMin, pairNum: num })
    // 5-минутная перемена внутри пары
    result.push({ type: 'pair_break', label: 'Перемена', startMin: startMin + halfMin, endMin: startMin + halfMin + PAIR_BREAK_MIN, pairNum: num })
    // Вторая половина пары
    result.push({ type: 'pair', label: `${num} пара`, startMin: startMin + halfMin + PAIR_BREAK_MIN, endMin, pairNum: num })

    if (i < PAIRS.length - 1) {
      const [nh, nm] = [PAIRS[i + 1][0], PAIRS[i + 1][1]]
      const breakStart = endMin
      const breakEnd = toMin(nh, nm)
      if (LUNCH_AFTER.includes(num)) {
        result.push({ type: 'lunch', label: 'Обед', startMin: breakStart, endMin: breakEnd })
      } else {
        result.push({ type: 'break', label: 'Перемена', startMin: breakStart, endMin: breakEnd })
      }
    }
  }
  return result
})()

function fmtTime(m: number) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return '00:00.000'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const millis = ms % 1000
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function slotMs(min: number) { return min * 60 * 1000 }

const DAY_START_MS = slotMs(8 * 60 - 10) // условная «точка отсчёта» дня — 07:50

/**
 * Круговой неоновый индикатор: «до конца пары / до звонка».
 * В центре — песочные часы (существующая деталь интерфейса).
 */
function ProgressRing({ progress, children }: { progress: number; children?: ReactNode }) {
  const SIZE = 232
  const STROKE = 10
  const R = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * R
  const p = Math.max(0, Math.min(1, progress))

  return (
    <div
      className="time-ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label="Прогресс до звонка"
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <defs>
          <linearGradient id="time-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle className="time-ring-track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
        <circle
          className="time-ring-fill"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
        />
      </svg>
      <div className="time-ring-center" aria-hidden="true">{children}</div>
    </div>
  )
}

interface TimeStatus {
  status: 'weekend' | 'empty' | 'before' | 'active'
  current: Slot | null
  next: Slot | null
  remainingMs: number
  totalMs: number
}

function getTimeStatus(): TimeStatus {
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const day = now.getDay()
  if (day === 0 || day === 6) return { status: 'weekend', current: null, next: null, remainingMs: 0, totalMs: 0 }

  let current: Slot | null = null
  let next: Slot | null = null

  for (const slot of TIMELINE) {
    const s = slotMs(slot.startMin)
    const e = slotMs(slot.endMin)
    if (nowMs >= s && nowMs < e) {
      current = slot
      break
    }
    if (nowMs < s && !next) {
      next = slot
    }
  }

  if (!current && !next) return { status: 'empty', current: null, next: null, remainingMs: 0, totalMs: 0 }

  if (current) {
    const endMs = slotMs(current.endMin)
    const startMs = slotMs(current.startMin)
    const remainingMs = Math.max(0, endMs - nowMs)
    const totalMs = endMs - startMs
    const nxt = TIMELINE.find(s => s.startMin >= current!.endMin) ?? null
    return { status: 'active', current, next: nxt, remainingMs, totalMs }
  }

  return { status: 'before', current: null, next, remainingMs: 0, totalMs: 0 }
}

function Hourglass({ progress }: { progress: number }) {
  const p = Math.max(0, Math.min(1, progress))

  // Верхняя куча песка: оседает сверху вниз
  const topY = 10 + (1 - p) * 24
  const topH = Math.max(0.5, p * 24)
  // Нижняя куча: растёт снизу вверх
  const botH = Math.max(0.5, (1 - p) * 26)
  const botY = 88 - botH
  const flowing = p > 0 && p < 1

  return (
    <div className={`hourglass-wrapper ${flowing ? 'flowing' : ''}`}>
      <svg viewBox="0 0 64 96" className="hourglass-svg" aria-hidden="true">
        <defs>
          <linearGradient id="hg-sand-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="hg-sand-bot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="hg-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--text)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--text-3)" stopOpacity="0.35" />
          </linearGradient>
          <filter id="hg-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* рама: верхняя и нижняя пластины */}
        <rect x="11" y="0" width="42" height="6" rx="3" fill="var(--text-3)" opacity="0.55" />
        <rect x="11" y="90" width="42" height="6" rx="3" fill="var(--text-3)" opacity="0.55" />

        {/* стойки */}
        <path d="M13,5 L13,91 L16,91 L16,3 Z" fill="var(--text-3)" opacity="0.35" />
        <path d="M51,5 L51,91 L48,91 L48,3 Z" fill="var(--text-3)" opacity="0.35" />

        {/* верхняя колба */}
        <path
          d="M17,7 L47,7 Q49,7 49,9 L49,32 Q49,38 44,41 L34,46.5 Q32,47.5 30,46.5 L20,41 Q15,38 15,32 L15,9 Q15,7 17,7 Z"
          fill="none" stroke="url(#hg-glass)" strokeWidth="1.6"
        />
        {/* нижняя колба */}
        <path
          d="M20,49.5 L30,49.5 Q32,48.5 34,49.5 L44,55 Q49,58 49,64 L49,87 Q49,89 47,89 L17,89 Q15,89 15,87 L15,64 Q15,58 20,55 Z"
          fill="none" stroke="url(#hg-glass)" strokeWidth="1.6"
        />

        {/* блик на стекле */}
        <path d="M20,12 Q19,24 23,32" fill="none" stroke="white" strokeWidth="1.6" opacity="0.14" strokeLinecap="round" />

        {/* верхний песок */}
        {topH > 0.5 && (
          <path
            className="sand-top"
            d={`M15,${topY + topH} L49,${topY + topH} L49,41 Q44,38 34,45 Q32,46 30,45 Q20,38 15,41 Z`}
            fill="url(#hg-sand-top)"
          />
        )}
        {/* поверхность верхнего песка */}
        {topH > 0.5 && (
          <ellipse cx="32" cy={topY + topH} rx="17" ry="2.2" fill="var(--accent-strong)" opacity="0.85" className="sand-surface-top" />
        )}

        {/* струйка песка */}
        {flowing && (
          <g className="sand-stream-group" filter="url(#hg-glow)">
            <line
              x1="32" y1="46" x2="32" y2="88"
              stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"
              className="sand-stream" strokeDasharray="2.5 3.5"
            />
            <circle cx="32" cy="88" r="1.6" fill="var(--accent)" className="sand-drop" />
          </g>
        )}

        {/* нижний песок */}
        {botH > 0.5 && (
          <path
            className="sand-bot"
            d={`M15,89 L49,89 L49,${botY + 4} Q40,${botY - 2} 32,${botY} Q24,${botY - 2} 15,${botY + 4} Z`}
            fill="url(#hg-sand-bot)"
          />
        )}
        {/* поверхность нижнего песка */}
        {botH > 0.5 && (
          <ellipse cx="32" cy={botY + 1} rx={12 + p * 5} ry="2" fill="var(--accent-strong)" opacity="0.7" className="sand-surface-bot" />
        )}
      </svg>
    </div>
  )
}

export function TimeScreen() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [])

  const ts = getTimeStatus()
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const hourglassProgress = ts.status === 'active' ? 1 - ts.remainingMs / ts.totalMs : 0

  const clockTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

  if (ts.status === 'weekend') {
    return (
      <>
        <div className="date-hero">
          <div className="date-eyebrow">Время</div>
        </div>
        <div className="time-status-card">
          <ProgressRing progress={0}>
            <Hourglass progress={0} />
          </ProgressRing>
          <div className="time-big">{clockTime}</div>
          <div className="time-subtitle">Выходной — пар нет</div>
        </div>
        <DayTimeline nowMs={-1} />
      </>
    )
  }

  if (ts.status === 'empty' || (!ts.current && !ts.next)) {
    return (
      <>
        <div className="date-hero">
          <div className="date-eyebrow">Время</div>
        </div>
        <div className="time-status-card">
          <ProgressRing progress={1}>
            <Hourglass progress={1} />
          </ProgressRing>
          <div className="time-big">{clockTime}</div>
          <div className="time-subtitle">Пары закончились</div>
        </div>
        <DayTimeline nowMs={nowMs} />
      </>
    )
  }

  if (ts.status === 'before' && ts.next) {
    const diff = slotMs(ts.next.startMin) - nowMs
    // Прогресс «до звонка»: доля времени от конца предыдущего слота до начала следующего
    let prevEnd = DAY_START_MS
    for (const s of TIMELINE) {
      const e = slotMs(s.endMin)
      if (e <= nowMs && e > prevEnd) prevEnd = e
    }
    const ringTotal = slotMs(ts.next.startMin) - prevEnd
    const ringP = ringTotal > 0 ? (nowMs - prevEnd) / ringTotal : 0
    const beforeLabel = ts.next.type === 'pair' ? `До начала ${ts.next.label}` : 'До звонка'
    return (
      <>
        <div className="date-hero">
          <div className="date-eyebrow">Время</div>
        </div>
        <div className="time-status-card before-pair">
          <ProgressRing progress={ringP}>
            <Hourglass progress={0} />
          </ProgressRing>
          <div className="time-big">{fmtCountdown(Math.max(0, diff))}</div>
          <div className="time-current-label">{beforeLabel}</div>
        </div>
        <DayTimeline nowMs={nowMs} />
      </>
    )
  }

  const current = ts.current!
  const isLunch = current.type === 'lunch'
  const isBreak = current.type === 'break'
  const isPairBreak = current.type === 'pair_break'
  const pairName = current.pairNum ? `${current.pairNum} пара` : current.label
  const activeLabel = isLunch
    ? 'Обеденный перерыв'
    : isPairBreak
      ? `Перемена (${pairName})`
      : isBreak
        ? 'Перемена'
        : `До конца ${current.pairNum}-й пары`

  return (
    <>
      <div className="date-hero">
        <div className="date-eyebrow">Время</div>
      </div>

      <div className={`time-status-card ${isLunch ? 'lunch' : isBreak || isPairBreak ? 'break' : 'pair'}`}>
        <ProgressRing progress={hourglassProgress}>
          <Hourglass progress={hourglassProgress} />
        </ProgressRing>
        <div className="time-big">{fmtCountdown(ts.remainingMs)}</div>
        <div className="time-current-label">{activeLabel}</div>
        {ts.next && (
          <div className="time-next">
            Далее: {ts.next.label} ({fmtTime(ts.next.startMin)})
          </div>
        )}
      </div>

      <DayTimeline nowMs={nowMs} currentStartMin={current.startMin} />
    </>
  )
}

function DayTimeline({ nowMs, currentStartMin }: { nowMs: number; currentStartMin?: number }) {
  return (
    <div className="time-timeline">
      {TIMELINE.map((slot, i) => {
        const isCurrent = currentStartMin !== undefined && slot.startMin === currentStartMin
        const isPast = nowMs >= slotMs(slot.endMin)
        const isFuture = nowMs >= 0 && nowMs < slotMs(slot.startMin) && !isCurrent
        return (
          <div
            key={i}
            className={`time-slot ${slot.type} ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
          >
            <span className="time-slot-time">{fmtTime(slot.startMin)}</span>
            <div className="time-slot-bar">
              <span className="time-slot-label">{slot.label}</span>
            </div>
            <span className="time-slot-time">{fmtTime(slot.endMin)}</span>
          </div>
        )
      })}
    </div>
  )
}
