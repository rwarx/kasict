export function downloadScheduleImage(options: {
  date: string
  group: string
  weekday: string
  parity: string
  lessons: Array<{
    number: number
    time_start: string
    time_end: string
    subject: string
    teacher: string
    classroom: string
    status: string
  }>
}): void {
  const scale = 2
  const width = 900
  const rowHeight = 94
  const headerHeight = 205
  const footerHeight = 48
  const height = headerHeight + Math.max(options.lessons.length, 1) * rowHeight + footerHeight
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f4f4f1'
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff'
  const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#202027'
  const text2 = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() || '#676772'
  const text3 = getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim() || '#94949d'
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4a50e0'
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e4e4e8'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = accent
  ctx.font = '700 14px Arial'
  ctx.fillText('KASICT  ·  РАСПИСАНИЕ', 56, 54)
  ctx.fillStyle = text
  ctx.font = '700 34px Arial'
  ctx.fillText(options.weekday, 56, 101)
  ctx.font = '400 18px Arial'
  ctx.fillStyle = text2
  ctx.fillText(formatExportDate(options.date), 56, 132)
  ctx.font = '600 16px Arial'
  ctx.fillStyle = text
  ctx.fillText(options.group, width - 56 - ctx.measureText(options.group).width, 56)
  ctx.font = '400 14px Arial'
  ctx.fillStyle = text3
  const parityWidth = ctx.measureText(options.parity).width
  ctx.fillText(options.parity, width - 56 - parityWidth, 82)

  if (options.lessons.length === 0) {
    drawRoundRect(ctx, 40, headerHeight, width - 80, rowHeight, 18)
    ctx.fillStyle = surface
    ctx.fill()
    ctx.fillStyle = text2
    ctx.font = '500 16px Arial'
    ctx.fillText('Пар нет', 68, headerHeight + 54)
  } else {
    options.lessons.forEach((lesson, index) => {
      const y = headerHeight + index * rowHeight
      drawRoundRect(ctx, 40, y, width - 80, rowHeight - 8, 16)
      ctx.fillStyle = surface
      ctx.fill()
      ctx.strokeStyle = border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = accent
      ctx.font = '700 14px Arial'
      ctx.fillText(`#${lesson.number}`, 68, y + 35)
      ctx.fillStyle = text3
      ctx.font = '400 13px Arial'
      ctx.fillText(`${lesson.time_start}–${lesson.time_end}`, 68, y + 59)
      ctx.fillStyle = text
      ctx.font = '700 18px Arial'
      ctx.fillText(lesson.subject || (lesson.status === 'cancelled' ? 'Пара отменена' : 'Без названия'), 210, y + 38)
      ctx.fillStyle = text2
      ctx.font = '400 14px Arial'
      const details = [lesson.teacher, lesson.classroom ? `${lesson.classroom} каб.` : ''].filter(Boolean).join(' · ')
      ctx.fillText(details || 'Дополнительная информация отсутствует', 210, y + 63)
      if (lesson.status !== 'normal') {
        ctx.fillStyle = accent
        ctx.font = '600 12px Arial'
        const status = lesson.status === 'cancelled' ? 'ОТМЕНЕНО' : lesson.status === 'added' ? 'ДОБАВЛЕНО' : 'ИЗМЕНЕНИЕ'
        const statusWidth = ctx.measureText(status).width
        ctx.fillText(status, width - 68 - statusWidth, y + 47)
      }
    })
  }

  ctx.fillStyle = text3
  ctx.font = '400 12px Arial'
  ctx.fillText('Сохранено из приложения KASICT', 56, height - 23)

  canvas.toBlob(async (blob) => {
    if (!blob) return
    const file = new File([blob], `kasict-${options.date}.png`, { type: 'image/png' })

    // Mobile: Web Share API → нативное меню «Поделиться» → «Сохранить в галерею»
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: `Расписание — ${options.date}`,
          text: `${options.group} · ${options.weekday}`,
          files: [file],
        })
        return
      } catch {
        // пользователь отменил — fallback ниже
      }
    }

    // Desktop / fallback: обычное скачивание
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `kasict-${options.date}.png`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function formatExportDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
