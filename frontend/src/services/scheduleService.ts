// Загрузка и кэширование данных расписания.

import type { MetaJSON, ReplacementBlockJSON, ScheduleJSON } from '../parser/types'
import { createResolverFromBlocks, type ParityResolver } from './parity'
import { applyDay, type DaySchedule } from './replacementEngine'

const DATA_BASE = '/data'
const CACHE_KEY_PREFIX = 'schedule:'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 часов (как GitHub Actions)

interface CacheEntry<T> {
  data: T
  ts: number
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null
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
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`)
  return resp.json() as Promise<T>
}

let _schedule: ScheduleJSON | null = null
let _replacements: ReplacementBlockJSON[] | null = null
let _meta: MetaJSON | null = null
let _resolver: ParityResolver | null = null

export async function loadData(): Promise<void> {
  // Try cache first
  _schedule = cacheGet<ScheduleJSON>('schedule')
  _replacements = cacheGet<ReplacementBlockJSON[]>('replacements')
  _meta = cacheGet<MetaJSON>('meta')

  if (_schedule && _replacements && _meta) {
    _resolver = createResolverFromBlocks(_replacements)
    return
  }

  // Fetch from network
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
  } catch (e) {
    // If network fails but cache exists, use it
    if (_schedule && _replacements && _meta) {
      _resolver = createResolverFromBlocks(_replacements)
      return
    }
    throw e
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
