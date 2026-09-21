// Личные заметки/домашка к парам.
// Хранение — localStorage на устройстве (origin-bound): переживает
// перезагрузки и работает офлайн; между устройствами не синхронизируется.

import { useEffect, useState } from 'react'

export interface PairNote {
  text: string
  updatedAt: number
}

const NOTES_KEY = 'schedule:notes:v1'
const NOTES_EVENT = 'kasict:notes-changed'

type NoteMap = Record<string, PairNote>

function noteKey(group: string, dateISO: string, pair: number): string {
  return `${group}|${dateISO}|${pair}`
}

function readAll(): NoteMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as NoteMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: NoteMap): void {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(map))
  } catch { /* quota exceeded — ignore */ }
  window.dispatchEvent(new Event(NOTES_EVENT))
}

export function getNote(group: string, dateISO: string, pair: number): PairNote | null {
  return readAll()[noteKey(group, dateISO, pair)] ?? null
}

/** Все заметки на день: { номер пары: текст }. */
export function getDayNotes(group: string, dateISO: string): Record<number, string> {
  const all = readAll()
  const day: Record<number, string> = {}
  for (const [key, note] of Object.entries(all)) {
    if (!key.startsWith(`${group}|${dateISO}|`)) continue
    const pair = Number(key.split('|')[2])
    if (Number.isFinite(pair) && note?.text) day[pair] = note.text
  }
  return day
}

/** Сохранить заметку; пустой текст удаляет заметку. */
export function setNote(group: string, dateISO: string, pair: number, text: string): void {
  const all = readAll()
  const key = noteKey(group, dateISO, pair)
  const trimmed = text.trim()
  if (!trimmed) {
    delete all[key]
  } else {
    all[key] = { text: trimmed, updatedAt: Date.now() }
  }
  writeAll(all)
}

export function useDayNotes(group: string, dateISO: string): Record<number, string> {
  const [notes, setNotes] = useState<Record<number, string>>(() => getDayNotes(group, dateISO))

  useEffect(() => {
    const sync = () => setNotes(getDayNotes(group, dateISO))
    sync()
    window.addEventListener(NOTES_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(NOTES_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [group, dateISO])

  return notes
}
