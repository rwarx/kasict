// Бейдж приложения (Badging API): число замен на сегодня для выбранной группы.
// Android/Chrome — точка с цифрой на иконке; iOS 16.4+ — на PWA, добавленном на «Домой».
// Где не поддерживается — тихо игнорируем.

import { getSnapshot } from '../services/scheduleService'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Сколько записей о заменах (включая отмены) сегодня у группы. */
export function todayReplacementsCount(group: string | null): number {
  if (!group) return 0
  try {
    const today = todayISO()
    let count = 0
    for (const block of getSnapshot().replacements ?? []) {
      if (block.date !== today) continue
      for (const r of block.replacements) {
        if (r.group === group) count++
      }
    }
    return count
  } catch {
    return 0
  }
}

/** Обновить системный бейдж иконки: число замен сегодня (0 — снять бейдж). */
export function updateAppBadge(group: string | null): void {
  try {
    if (typeof navigator.setAppBadge !== 'function') return
    const count = todayReplacementsCount(group)
    if (count > 0) void navigator.setAppBadge(count).catch(() => {})
    else void navigator.clearAppBadge().catch(() => {})
  } catch {
    /* Badging API недоступен — не критично */
  }
}
