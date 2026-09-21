// Загрузка и кэширование данных расписания.

import { useEffect, useState } from 'react'
import type { MetaJSON, ReplacementBlockJSON, ScheduleJSON } from '../parser/types'
import { createResolverFromBlocks, type ParityResolver } from './parity'
import { applyDay, type DaySchedule, type LessonStatus } from './replacementEngine'
import { summarizeScheduleChanges, type DataChangeSummary } from './scheduleChanges'
import { saveSnapshot } from './history'

const DATA_BASE = './data'
const CACHE_KEY_PREFIX = 'schedule:'
const FETCH_TIMEOUT_MS = 10_000

interface CacheEntry<T> {
  data: T
  ts: number
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    return entry.data
  } catch {
    return null
  }
}

function cacheSet<T>(key: string, data: T) {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() }
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry))
  } catch { /* quota exceeded — ignore */ }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const resp = await fetch(path, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`)
  return resp.json() as Promise<T>
}

let _schedule: ScheduleJSON | null = null
let _replacements: ReplacementBlockJSON[] | null = null
let _meta: MetaJSON | null = null
let _resolver: ParityResolver | null = null
let _lastChanges: DataChangeSummary | null = null
const _dataListeners = new Set<() => void>()

/** Подписка на фоновые обновления данных (stale-while-revalidate). */
export function subscribeData(callback: () => void): () => void {
  _dataListeners.add(callback)
  return () => { _dataListeners.delete(callback) }
}

/** Версия данных: растёт при каждом фоновом обновлении — заставляет экраны перечитаться. */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeData(() => setVersion(value => value + 1)), [])
  return version
}

function commitData(sched: ScheduleJSON, reps: ReplacementBlockJSON[], meta: MetaJSON): void {
  _schedule = sched
  _replacements = reps
  _meta = meta
  _resolver = createResolverFromBlocks(reps)
  cacheSet('schedule', sched)
  cacheSet('replacements', reps)
  cacheSet('meta', meta)
}

function applyCache(): boolean {
  const sched = cacheGet<ScheduleJSON>('schedule')
  const reps = cacheGet<ReplacementBlockJSON[]>('replacements')
  const meta = cacheGet<MetaJSON>('meta')
  if (sched && reps && meta) {
    _schedule = sched
    _replacements = reps
    _meta = meta
    _resolver = createResolverFromBlocks(reps)
    return true
  }
  return false
}

/**
 * Фоновая сверка замен: качаем только meta.json (300 Б вместо 750 КБ).
 * Полные файлы — только если updated_at изменился.
 */
export async function revalidateInBackground(): Promise<void> {
  try {
    const meta = await fetchJSON<MetaJSON>(`${DATA_BASE}/meta.json`)
    if (!meta?.updated_at || meta.updated_at === _meta?.updated_at) return

    const previousSchedule = _schedule
    const previousReplacements = _replacements
    const [sched, reps] = await Promise.all([
      fetchJSON<ScheduleJSON>(`${DATA_BASE}/schedule.json`),
      fetchJSON<ReplacementBlockJSON[]>(`${DATA_BASE}/replacements.json`),
    ])
    _lastChanges = summarizeScheduleChanges(previousSchedule, sched, previousReplacements, reps)
    commitData(sched, reps, meta)
    saveSnapshot(sched, reps, meta).catch(() => {})
    _dataListeners.forEach(listener => listener())
  } catch {
    // сеть недоступна или сервер не отвечает — молча остаёмся на кэше
  }
}

export async function loadData(): Promise<void> {
  // Мгновенный старт: рендерим из localStorage, свежесть сверяем в фоне.
  if (applyCache()) {
    void revalidateInBackground()
    return
  }

  // Холодный старт: полная загрузка с сети; кэш — офлайн-фолбэк.
  try {
    const [sched, reps, meta] = await Promise.all([
      fetchJSON<ScheduleJSON>(`${DATA_BASE}/schedule.json`),
      fetchJSON<ReplacementBlockJSON[]>(`${DATA_BASE}/replacements.json`),
      fetchJSON<MetaJSON>(`${DATA_BASE}/meta.json`),
    ])
    _lastChanges = null
    commitData(sched, reps, meta)

    // Сохраняем снимок в IndexedDB (не блокируя UI)
    saveSnapshot(sched, reps, meta).catch(() => {})
  } catch {
    if (applyCache()) return
    throw new Error('Нет данных: сеть недоступна, локальный кэш пуст')
  }
}

export function isLoaded(): boolean {
  return _schedule !== null && _replacements !== null && _resolver !== null
}

export function getGroups(): { name: string; number: number }[] {
  if (!_schedule) return []
  return Object.values(_schedule.groups).sort((a, b) => a.number - b.number)
}

export function getDay(group: string, d: Date): DaySchedule | null {
  if (!_schedule || !_replacements || !_resolver) return null
  const parity = _resolver.parity(d)
  return applyDay(_schedule, group, d, parity, _replacements, _meta?.updated_at ?? null)
}

export function getMeta(): MetaJSON | null {
  return _meta
}

export function getLastChanges(): DataChangeSummary | null {
  return _lastChanges
}

export function getTeachers(): Record<string, import('../parser/types').TeacherEntry[]> {
  if (!_schedule) return {}
  const normalized: Record<string, import('../parser/types').TeacherEntry[]> = {}
  Object.entries(_schedule.teachers ?? {}).forEach(([rawName, entries]) => {
    const name = rawName.replace(/^[-–—\s]+/, '').trim() || rawName
    normalized[name] = [...(normalized[name] ?? []), ...entries]
  })
  return normalized
}

export interface TeacherLessonView {
  number: number
  time_start: string
  time_end: string
  subject: string
  classroom: string
  group: string
  status: LessonStatus
  original: { subject: string; teacher: string; classroom: string } | null
}

function normTeacher(name: string): string {
  return name.replace(/^[-–—\s]+/, '').trim()
}

/** День преподавателя с применёнными заменами (по всем его группам). */
export function getTeacherDay(teacher: string, d: Date): TeacherLessonView[] {
  if (!_schedule || !_replacements || !_resolver) return []
  const target = normTeacher(teacher)
  if (!target) return []
  const parity = _resolver.parity(d)
  const found: TeacherLessonView[] = []
  for (const group of Object.keys(_schedule.lessons)) {
    const day = applyDay(_schedule, group, d, parity, _replacements, null)
    for (const lesson of day.lessons) {
      const current = normTeacher(lesson.teacher) === target
      const wasCancelled = lesson.status === 'cancelled'
        && Boolean(lesson.original) && normTeacher(lesson.original!.teacher) === target
      if (!current && !wasCancelled) continue
      if (!lesson.subject && lesson.status !== 'cancelled') continue
      found.push({
        number: lesson.number,
        time_start: lesson.time_start,
        time_end: lesson.time_end,
        subject: lesson.status === 'cancelled' ? (lesson.original?.subject || '') : lesson.subject,
        classroom: lesson.classroom,
        group,
        status: lesson.status,
        original: lesson.original,
      })
    }
  }
  return found.sort((a, b) => a.number - b.number || a.group.localeCompare(b.group, 'ru'))
}

export function getParity(d: Date): 'odd' | 'even' | null {
  return _resolver ? _resolver.parity(d) as 'odd' | 'even' : null
}

export function getPairTimes(): Record<string, [string, string]> {
  return _schedule?.pair_times ?? {}
}

export function getSnapshot(): { schedule: ScheduleJSON | null; replacements: ReplacementBlockJSON[] | null } {
  return { schedule: _schedule, replacements: _replacements }
}

export function getStaleMeta(): MetaJSON | null {
  // Return meta even if cache expired
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + 'meta')
    if (!raw) return null
    return JSON.parse(raw).data
  } catch {
    return null
  }
}

/** Загрузить данные из исторического снимка (для просмотра прошлого расписания). */
export function loadSnapshotData(snapshot: { schedule: ScheduleJSON; replacements: ReplacementBlockJSON[]; meta: MetaJSON }) {
  _schedule = snapshot.schedule
  _replacements = snapshot.replacements
  _meta = snapshot.meta
  _resolver = createResolverFromBlocks(snapshot.replacements)
}
