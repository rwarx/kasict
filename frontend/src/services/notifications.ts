// Уведомления об изменениях расписания.
// Для статического GitHub Pages-приложения проверка выполняется при открытии,
// а установленный PWA дополнительно использует Periodic Background Sync.

import type { MetaJSON } from '../parser/types'
import type { DataChangeSummary } from './scheduleChanges'

export type NotificationKind = 'changes' | 'teacher' | 'room'

const PREF_KEYS: Record<NotificationKind, string> = {
  changes: 'schedule:notifChanges',
  teacher: 'schedule:notifTeacher',
  room: 'schedule:notifRoom',
}
const LEGACY_PREF_KEY = 'schedule:notifEnabled'
const SEEN_KEY = 'schedule:lastSeenUpdate'
const SYNC_TAG = 'schedule-update'

export function isNotifSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function isNotificationEnabled(kind: NotificationKind): boolean {
  if (!isNotifSupported()) return false
  try {
    const current = localStorage.getItem(PREF_KEYS[kind])
    if (current !== null) return current === 'true' && Notification.permission === 'granted'
    // Сохраняем поведение старого единого переключателя после обновления приложения.
    return kind === 'changes' && localStorage.getItem(LEGACY_PREF_KEY) === 'true' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

export function isNotifEnabled(): boolean {
  return isNotificationEnabled('changes')
}

export function notifStatusText(kind: NotificationKind = 'changes'): string {
  if (!isNotifSupported()) return 'Не поддерживаются браузером'
  if (Notification.permission === 'denied') return 'Заблокированы в браузере'
  return isNotificationEnabled(kind) ? 'Включены' : 'Выключены'
}

export async function enableNotifications(kind: NotificationKind = 'changes'): Promise<boolean> {
  if (!isNotifSupported()) return false
  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  try {
    localStorage.setItem(PREF_KEYS[kind], perm === 'granted' ? 'true' : 'false')
    if (kind === 'changes') localStorage.setItem(LEGACY_PREF_KEY, perm === 'granted' ? 'true' : 'false')
  } catch { /* ignore */ }
  if (perm === 'granted') await registerPeriodicSync()
  return perm === 'granted'
}

export function disableNotifications(kind: NotificationKind = 'changes'): void {
  try {
    localStorage.setItem(PREF_KEYS[kind], 'false')
    if (kind === 'changes') localStorage.setItem(LEGACY_PREF_KEY, 'false')
  } catch { /* ignore */ }
  if (!isNotificationEnabled('changes') && !isNotificationEnabled('teacher') && !isNotificationEnabled('room')) {
    unregisterPeriodicSync()
  }
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.getRegistration() ?? null
  } catch {
    return null
  }
}

async function registerPeriodicSync(): Promise<void> {
  try {
    const reg = await swRegistration()
    const periodic = (reg as (ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> }
    }) | null)?.periodicSync
    if (reg && periodic) {
      await periodic.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 })
    }
  } catch { /* нет периодической синхронизации (не установлено PWA / Safari) */ }
}

async function unregisterPeriodicSync(): Promise<void> {
  try {
    const reg = await swRegistration()
    const periodic = (reg as (ServiceWorkerRegistration & {
      periodicSync?: { unregister: (tag: string) => Promise<void> }
    }) | null)?.periodicSync
    if (reg && periodic) await periodic.unregister(SYNC_TAG)
  } catch { /* ignore */ }
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function countLabel(count: number, one: string, few: string, many: string): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} ${one}`
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return `${count} ${few}`
  return `${count} ${many}`
}

function buildGeneralBody(meta: MetaJSON, changes?: DataChangeSummary): string {
  if (changes) {
    const parts: string[] = []
    if (changes.added) parts.push(countLabel(changes.added, 'пара добавлена', 'пары добавлены', 'пар добавлено'))
    if (changes.cancelled) parts.push(countLabel(changes.cancelled, 'пара отменена', 'пары отменены', 'пар отменено'))
    if (changes.changed) parts.push(countLabel(changes.changed, 'пара изменена', 'пары изменены', 'пар изменено'))
    if (parts.length) return parts.join(', ') + (changes.dates.length ? ` · ${changes.dates.map(fmtDate).join(', ')}` : '')
  }
  if (meta.replacement_dates?.length) return 'Новые изменения: ' + meta.replacement_dates.map(fmtDate).join(', ')
  return 'Расписание обновилось. Загляни!'
}

function buildDetailBody(changes: DataChangeSummary, kind: 'teacher' | 'room'): string {
  const count = kind === 'teacher' ? changes.teacherChanged : changes.roomChanged
  if (!count) return ''
  const subject = kind === 'teacher' ? 'преподавателе' : 'кабинете'
  return `${countLabel(count, 'изменение', 'изменения', 'изменений')} в ${subject}${changes.dates.length ? ` · ${changes.dates.map(fmtDate).join(', ')}` : ''}`
}

async function show(title: string, body: string, tag: string): Promise<void> {
  if (!body) return
  try {
    const reg = await swRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png' })
    } else {
      new Notification(title, { body, tag })
    }
  } catch { /* ignore */ }
}

/** Вызывать после успешной загрузки свежих данных с сервера. */
export async function handleNewData(meta: MetaJSON, changes?: DataChangeSummary | null): Promise<void> {
  let seen: string | null = null
  try {
    seen = localStorage.getItem(SEEN_KEY)
    localStorage.setItem(SEEN_KEY, meta.updated_at)
  } catch { /* ignore */ }
  // Первый запуск — просто запоминаем состояние, без уведомления.
  if (!seen || seen === meta.updated_at) return

  const detailed = changes && (changes.added + changes.cancelled + changes.changed > 0)
  if (isNotificationEnabled('changes') && (detailed || !changes)) {
    await show('Изменения в расписании', buildGeneralBody(meta, changes ?? undefined), 'schedule-changes')
  }
  if (changes && isNotificationEnabled('teacher')) {
    await show('Изменение преподавателя', buildDetailBody(changes, 'teacher'), 'schedule-teacher-change')
  }
  if (changes && isNotificationEnabled('room')) {
    await show('Изменение кабинета', buildDetailBody(changes, 'room'), 'schedule-room-change')
  }
}
