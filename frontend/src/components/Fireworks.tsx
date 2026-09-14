// Оверлей «День X»: canvas-фейерверк + поздравительная карточка.
// Оптимизации: DPR ≤ 2, лимит частиц, dt-физика с клампом, пауза при
// скрытой вкладке, поддержка prefers-reduced-motion, полная очистка ресурсов.

import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from './Icons'

const SHOW_MS = 9000   // длительность салюта до авто-закрытия
const FADE_MS = 500    // длительность исчезновения оверлея
const MAX_PARTICLES = 600
const MAX_ROCKETS = 7
const HUES = [45, 18, 340, 265, 190, 130] // золото, оранж, розовый, фиолет, циан, зелень

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number       // 1 → 0
  decay: number
  size: number
  hue: number
  twinkle: number    // скорость мерцания, 0 = без мерцания
}

interface Rocket {
  x: number; y: number
  vx: number; vy: number
  targetY: number
  hue: number
}

export function Fireworks({ onClose }: { onClose: () => void }) {
  const [closing, setClosing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const reducedRef = useRef(false)
  const closingRef = useRef(false)

  const beginClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, FADE_MS)
  }

  useEffect(() => {
    reducedRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    // Esc — закрыть
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') beginClose() }
    window.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()

    if (reducedRef.current) {
      const t = window.setTimeout(beginClose, 3200)
      return () => {
        window.clearTimeout(t)
        window.removeEventListener('keydown', onKey)
      }
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !ctx) return

    let W = 0, H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      W = Math.max(1, Math.round(rect.width))
      H = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: Particle[] = []
    const rockets: Rocket[] = []
    const rand = (a: number, b: number) => a + Math.random() * (b - a)

    const explode = (x: number, y: number, hue: number) => {
      const count = Math.max(34, Math.min(72, Math.round((W * H) / 14000)))
      const ring = Math.random() < 0.3
      for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) break
        const angle = ring
          ? (i / count) * Math.PI * 2 + rand(-0.05, 0.05)
          : Math.random() * Math.PI * 2
        const speed = ring ? rand(2.4, 3.1) : rand(0.8, 3.4)
        const h = Math.random() < 0.12 ? rand(0, 360) : hue + rand(-14, 14)
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: rand(0.008, 0.016),
          size: rand(1.4, 2.6),
          hue: (h + 360) % 360,
          twinkle: Math.random() < 0.35 ? rand(0.15, 0.4) : 0,
        })
      }
    }

    const launch = () => {
      if (rockets.length >= MAX_ROCKETS) return
      const hue = HUES[Math.floor(Math.random() * HUES.length)]
      rockets.push({
        x: rand(W * 0.12, W * 0.88),
        y: H + 8,
        vx: rand(-0.5, 0.5),
        vy: rand(-9.5, -7.4) * (H > 700 ? 1.12 : 1),
        targetY: rand(H * 0.16, H * 0.44),
        hue,
      })
    }

    let raf = 0
    let last = performance.now()
    let elapsed = 0
    let nextLaunch = 60
    let running = true

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(48, now - last) / 16.6667 // нормализуем к «кадрам 60fps»
      last = now
      elapsed += dt * 16.6667

      // следы: затираем прошлый кадр, сохраняя прозрачность канваса
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'

      // запуск новых ракет (в конце — финал погуще)
      if (elapsed < SHOW_MS - 1600) {
        const interval = elapsed > SHOW_MS - 4000 ? rand(240, 420) : rand(420, 780)
        if (elapsed >= nextLaunch) { launch(); nextLaunch = elapsed + interval }
      } else if (elapsed < SHOW_MS && elapsed >= nextLaunch) {
        launch(); launch()
        nextLaunch = elapsed + rand(300, 500)
      }

      // ракеты
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.x += r.vx * dt
        r.y += r.vy * dt
        r.vy += 0.055 * dt
        ctx.fillStyle = `hsla(${r.hue}, 100%, 72%, 0.95)`
        ctx.beginPath()
        ctx.arc(r.x, r.y, 1.7, 0, Math.PI * 2)
        ctx.fill()
        if (r.y <= r.targetY || r.vy >= -1.2) {
          explode(r.x, r.y, r.hue)
          rockets.splice(i, 1)
        }
      }

      // частицы (swap-remove, без пересоздания массива)
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.vx *= 0.985
        p.vy = p.vy * 0.985 + 0.032 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= p.decay * dt
        if (p.life <= 0 || p.y > H + 12) {
          const lastIdx = particles.length - 1
          if (i !== lastIdx) particles[i] = particles[lastIdx]
          particles.pop()
          continue
        }
        const alpha = p.life * (p.twinkle ? 0.62 + 0.38 * Math.sin(elapsed * p.twinkle) : 1)
        const light = 58 + 26 * p.life
        ctx.fillStyle = `hsla(${p.hue}, 96%, ${light}%, ${alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.55 + 0.45 * p.life), 0, Math.PI * 2)
        ctx.fill()
      }

      if (elapsed >= SHOW_MS + FADE_MS) beginClose()
    }

    // пауза при скрытой вкладке: не жжём батарею и не накапливаем dt
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      particles.length = 0
      rockets.length = 0
      canvas.width = 0
      canvas.height = 0
    }
    // beginClose стабилен (ref) — эффект монтирования выполняется один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`fireworks-overlay ${closing ? 'closing' : ''}`} onClick={beginClose}>
      {!reducedRef.current && <canvas ref={canvasRef} className="fireworks-canvas" aria-hidden="true" />}
      <div
        className="fireworks-card"
        role="dialog"
        aria-modal="true"
        aria-label="Поздравляем: сегодня День X"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fireworks-eyebrow">18 сентября</div>
        <h2 className="fireworks-title">День X</h2>
        <p className="fireworks-text">Сегодня особенный день. Пусть всё получится!</p>
        <button type="button" ref={closeBtnRef} className="btn-solid fireworks-btn" onClick={beginClose}>
          Продолжить
        </button>
      </div>
      <button type="button" className="icon-btn fireworks-close" onClick={beginClose} aria-label="Закрыть поздравление">
        <CloseIcon size={16} />
      </button>
    </div>
  )
}
