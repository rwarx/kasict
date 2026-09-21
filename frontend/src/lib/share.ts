// Поделиться расписанием текстом: нативное меню → буфер обмена.

export interface ShareableLesson {
  number: number
  time_start: string
  time_end: string
  subject: string
  teacher: string
  classroom: string
  status: string
  original: { subject: string; teacher: string; classroom: string } | null
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function buildScheduleText(options: {
  date: string
  group: string
  weekday: string
  parity: string
  lessons: ShareableLesson[]
}): string {
  const lines: string[] = []
  lines.push(`Расписание ${options.group} — ${options.weekday}, ${formatDate(options.date)}`)
  lines.push('')

  if (options.lessons.length === 0) {
    lines.push('Пар нет — отдыхай ☕')
  } else {
    for (const lesson of options.lessons) {
      const time = `${lesson.time_start}–${lesson.time_end}`
      if (lesson.status === 'cancelled') {
        lines.push(`${lesson.number}. ${time} — ${lesson.original?.subject || 'пара'} — ОТМЕНА ❌`)
        continue
      }
      const parts = [lesson.subject || '—']
      if (lesson.classroom) parts.push(`каб. ${lesson.classroom}`)
      if (lesson.teacher) parts.push(lesson.teacher)
      let row = `${lesson.number}. ${time} — ${parts.join(', ')}`
      if (lesson.status === 'replaced') row += ' (замена 🔁)'
      if (lesson.status === 'added') row += ' (добавлено ➕)'
      lines.push(row)
    }
    lines.push('')
    lines.push(options.parity === 'Нечётная неделя' ? 'Нечётная неделя' : 'Чётная неделя')
  }
  lines.push('')
  lines.push('— отправлено из KASICT')
  return lines.join('\n')
}

export async function shareScheduleText(options: Parameters<typeof buildScheduleText>[0]): Promise<ShareResult> {
  const text = buildScheduleText(options)
  const title = `Расписание ${options.group}`

  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      // AbortError — пользователь закрыл меню; остальное — попытка через буфер
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
