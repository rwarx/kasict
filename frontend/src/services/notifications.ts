// Уведомления об обновлении расписания.
//
// Приложение статическое (без push-сервера), поэтому:
//  - при открытии приложения сравниваем meta.updated_at с последним виденным;
//  - в фоне работает Periodic Background Sync в Service Worker (Chrome/Android,
//    только для установленного PWA).

import type { MetaJSON } from '../parser/types'

const PREF_KEY = 'schedule:notifEnabled'
const SEEN_KEY = 'schedule:lastSeenUpdate'
const SYNC_TAG = 'schedule-update'

export function isNotifSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function isNotifEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'true' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

export function notifStatusText(): string {
  if (!isNotifSupported()) return 'Не поддерживаются браузером'
  if (Notification.permission === 'denied') return 'Заблокированы в браузере'
  return isNotifEnabled() ? 'Включены' : 'Выключены'
}

export async function enableNotifications(): Promise<boolean> {
  if (!isNotifSupported()) return false
  const perm = await Notification.requestPermission()
  try {
    localStorage.setItem(PREF_KEY, perm === 'granted' ? 'true' : 'false')
  } catch { /* ignore */ }
  if (perm === 'granted') await registerPeriodicSync()
  return perm === 'granted'
}

export function disableNotifications(): void {
  try {
    localStorage.setItem(PREF_KEY, 'false')
  } catch { /* ignore */ }
  unregisterPeriodicSync()
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

function buildBody(meta: MetaJSON): string {
  if (meta.replacement_dates?.length) {
    return 'Новые замены: ' + meta.replacement_dates.map(fmtDate).join(', ')
  }
  return 'Расписание обновилось. Загляни!'
}

/** Вызывать после успешной загрузки свежих данных с сервера. */
export async function handleNewData(meta: MetaJSON): Promise<void> {
  let seen: string | null = null
  try {
    seen = localStorage.getItem(SEEN_KEY)
    localStorage.setItem(SEEN_KEY, meta.updated_at)
  } catch { /* ignore */ }
  // первый запуск — просто запоминаем состояние, без уведомления
  if (!seen || seen === meta.updated_at) return
  if (!isNotifEnabled()) return

  const body = buildBody(meta)
  try {
    const reg = await swRegistration()
    if (reg) {
      await reg.showNotification('Расписание обновлено', {
        body,
        tag: 'data-update',
        icon: './icons/icon-192.png',
      })
    } else {
      new Notification('Расписание обновлено', { body, tag: 'data-update' })
    }
  } catch { /* ignore */ }
}
