// Архив расписания в IndexedDB.
// Хранит полные снимки (schedule + replacements + meta) с меткой времени.

import type { MetaJSON, ReplacementBlockJSON, ScheduleJSON } from '../parser/types'

const DB_NAME = 'kasict-history'
const DB_VERSION = 1
const STORE = 'snapshots'
const MAX_SNAPSHOTS = 200

export interface ScheduleSnapshot {
  id?: number
  timestamp: string
  schedule: ScheduleJSON
  replacements: ReplacementBlockJSON[]
  meta: MetaJSON
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Сохранить снимок. Если запись с таким timestamp уже есть — не дублирует. */
export async function saveSnapshot(
  schedule: ScheduleJSON,
  replacements: ReplacementBlockJSON[],
  meta: MetaJSON,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)

    // Проверяем, нет ли уже снимка с таким timestamp
    const idx = store.index('timestamp')
    const existing = idx.get(meta.updated_at)
    existing.onsuccess = () => {
      if (existing.result) {
        // Уже есть — пропускаем
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
        return
      }

      store.add({
        timestamp: meta.updated_at,
        schedule,
        replacements,
        meta,
      } satisfies ScheduleSnapshot)

      // Чистим старые снимки, оставляем MAX_SNAPSHOTS
      const countReq = store.count()
      countReq.onsuccess = () => {
        if (countReq.result > MAX_SNAPSHOTS) {
          const toDelete = countReq.result - MAX_SNAPSHOTS
          let deleted = 0
          const cursorReq = store.openCursor()
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (cursor && deleted < toDelete) {
              cursor.delete()
              deleted++
              cursor.continue()
            }
          }
        }
      }

      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    existing.onerror = () => { db.close(); reject(existing.error) }
  })
}

/** Получить все снимки (новые первые). */
export async function getAllSnapshots(): Promise<ScheduleSnapshot[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const results = (req.result as ScheduleSnapshot[]).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      db.close()
      resolve(results)
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** Получить снимок по timestamp (точное совпадение). */
export async function getSnapshotByTimestamp(ts: string): Promise<ScheduleSnapshot | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const idx = store.index('timestamp')
    const req = idx.get(ts)
    req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** Получить ближайший снимок до указанной даты. */
export async function getSnapshotBefore(dateISO: string): Promise<ScheduleSnapshot | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const idx = store.index('timestamp')
    const range = IDBKeyRange.upperBound(dateISO + 'T23:59:59')
    const req = idx.openCursor(range, 'prev')
    req.onsuccess = () => {
      const cursor = req.result
      db.close()
      resolve(cursor?.value ?? null)
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** Удалить все снимки. */
export async function clearHistory(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Количество снимков. */
export async function getSnapshotCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => { db.close(); resolve(req.result) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}
