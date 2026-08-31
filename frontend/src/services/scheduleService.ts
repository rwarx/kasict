// Загрузка и кэширование данных расписания.

import type { MetaJSON, ReplacementBlockJSON, ScheduleJSON } from '../parser/types'
import { createResolverFromBlocks, type ParityResolver } from './parity'
import { applyDay, type DaySchedule } from './replacementEngine'

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
  const resp = await fetch(path, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`)
  return resp.json() as Promise<T>
}

let _schedule: ScheduleJSON | null = null
let _replacements: ReplacementBlockJSON[] | null = null
let _meta: MetaJSON | null = null
let _resolver: ParityResolver | null = null

export async function loadData(): Promise<void> {
  // Network-first: всегда тянем свежие данные; кэш — офлайн-фолбэк.
  try {
    const [sched, reps, meta] = await Promise.all([
      fetchJSON<ScheduleJSON>(`${DATA_BASE}/schedule.json`),
      fetchJSON<ReplacementBlockJSON[]>(`${DATA_BASE}/replacements.json`),
      fetchJSON<MetaJSON>(`${DATA_BASE}/meta.json`),
    ])
    _schedule = sched
    _replacements = reps
    _meta = meta
    _resolver = createResolverFromBlocks(reps)
    cacheSet('schedule', sched)
    cacheSet('replacements', reps)
    cacheSet('meta', meta)
  } catch {
    const sched = cacheGet<ScheduleJSON>('schedule')
    const reps = cacheGet<ReplacementBlockJSON[]>('replacements')
    const meta = cacheGet<MetaJSON>('meta')
    if (sched && reps && meta) {
      _schedule = sched
      _replacements = reps
      _meta = meta
      _resolver = createResolverFromBlocks(reps)
      return
    }
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

export function getTeachers(): Record<string, import('../parser/types').TeacherEntry[]> {
  if (!_schedule) return {}
  return _schedule.teachers ?? {}
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
