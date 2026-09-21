// «Что нового»: показывается один раз при обновлении на новую версию.

export const APP_VERSION = '3.1.0'

export interface WhatsNewEntry {
  version: string
  items: string[]
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: APP_VERSION,
    items: [
      '📌 Заметки и домашка к парам — кнопка на карточке',
      '📊 Итоги недели: пары, окна, часы и самый загруженный день',
      '🔢 Бейдж с числом замен на иконке приложения',
      '🔗 Ярлыки: долгий тап по иконке — Сегодня / Неделя / Учителя',
      '📤 Поделиться расписанием дня текстом',
      '⚡ Проверка замен ускорена — свежие данные подхватываются на лету',
      '🕐 «Обновлено N назад»: тап по индикатору проверяет замены',
    ],
  },
]

const SEEN_KEY = 'schedule:whats-new-seen'

export function getSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
  } catch {
    /* noop */
  }
}

/** Есть ли непросмотренный ченджлог (последняя версия). */
export function pendingWhatsNew(): WhatsNewEntry | null {
  return getSeenVersion() === APP_VERSION ? null : WHATS_NEW[0] ?? null
}
