// Чат-сервис: общение с GPT через Cloudflare Worker прокси.

import { getPairTimes, getTeachers, getSnapshot, getParity } from './scheduleService'

const CHAT_STORAGE_KEY = 'schedule:chatHistory'
const MAX_HISTORY = 20

// В dev-режиме Vite проксирует /api/chat на Worker.
// В проде — прямой URL Worker.
const WORKER_URL = 'https://kasict-chat.kasict.workers.dev'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekdayName(d: Date): string {
  return ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()]
}

const DAY_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

function buildSystemPrompt(group: string | null): string {
  const now = new Date()
  const today = todayISO()
  const dayName = weekdayName(now)
  const pairTimes = getPairTimes()
  const teachers = getTeachers()
  const snap = getSnapshot()

  const lines: string[] = [
    'Ты — помощник студентов колледжа KASICT.',
    'Отвечай на русском языке. Будь дружелюбным, кратким и точным.',
    'Отвечай на основе переданных данных расписания.',
    'Если данных нет — скажи честно. Не придумывай факты.',
    'Учитывай замены (replacements) — они имеют приоритет над основным расписанием.',
    '',
    `Дата: ${today} (${dayName})`,
    `Время: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    '',
    'Время пар:',
  ]

  for (const [num, [start, end]] of Object.entries(pairTimes)) {
    lines.push(`  ${num} пара: ${start}–${end}`)
  }

  if (group && snap.schedule) {
    const parity = getParity(now)
    lines.push(`\nГруппа: ${group}`)
    lines.push(`Текущая неделя: ${parity === 'odd' ? 'нечётная' : 'чётная'}`)

    const groupLessons = snap.schedule.lessons[group]
    if (groupLessons) {
      lines.push('\nПолное расписание группы (по дням недели):')

      for (let wd = 0; wd < 7; wd++) {
        const dayPairs = groupLessons[String(wd)]
        if (!dayPairs || Object.keys(dayPairs).length === 0) continue

        lines.push(`\n  ${DAY_FULL[wd].toUpperCase()}:`)
        for (const p of [1, 2, 3, 4, 5, 6]) {
          const pair = dayPairs[String(p)]
          if (!pair) continue
          const odd = pair.odd
          const even = pair.even
          const t = pairTimes[String(p)] || ['?', '?']
          const time = `${t[0]}–${t[1]}`

          if (odd && even) {
            if (odd.subject === even.subject && odd.teacher === even.teacher) {
              lines.push(`    ${p} (${time}): ${odd.subject} · ${odd.teacher} · ${odd.classroom} каб.`)
            } else {
              lines.push(`    ${p} (${time}) [числ.]: ${odd.subject} · ${odd.teacher} · ${odd.classroom} каб.`)
              lines.push(`    ${p} (${time}) [знам.]: ${even.subject} · ${even.teacher} · ${even.classroom} каб.`)
            }
          } else if (odd) {
            lines.push(`    ${p} (${time}) [числ.]: ${odd.subject} · ${odd.teacher} · ${odd.classroom} каб.`)
          } else if (even) {
            lines.push(`    ${p} (${time}) [знам.]: ${even.subject} · ${even.teacher} · ${even.classroom} каб.`)
          }
        }
      }
    }

    if (snap.replacements && snap.replacements.length > 0) {
      lines.push('\nЗамены (изменения в расписании):')
      for (const block of snap.replacements) {
        if (block.replacements.length === 0) continue
        lines.push(`  ${block.date} (${block.day_word}):`)
        for (const r of block.replacements) {
          if (r.group !== group) continue
          const status = r.is_cancel ? 'ОТМЕНА' : `${r.subject} · ${r.teacher} · ${r.classroom} каб.`
          lines.push(`    Пары ${r.raw_pairs || 'все'}: ${status}`)
        }
      }
    }

    const teacherNames = Object.keys(teachers)
    if (teacherNames.length > 0) {
      lines.push(`\nПреподаватели (${teacherNames.length}): ${teacherNames.slice(0, 40).join(', ')}${teacherNames.length > 40 ? '...' : ''}`)
    }
  }

  return lines.join('\n')
}

export function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveChatHistory(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.filter(m => m.role !== 'system').slice(-MAX_HISTORY * 2)
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}

export function clearChatHistory(): void {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY)
  } catch { /* ignore */ }
}

export async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function sendMessage(
  messages: ChatMessage[],
  group: string | null,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(group)
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const resp = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: fullMessages }),
    signal,
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => `HTTP ${resp.status}`)
    throw new Error(err)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          result += delta
          onChunk(result)
        }
      } catch { /* ignore malformed chunks */ }
    }
  }

  return result
}
