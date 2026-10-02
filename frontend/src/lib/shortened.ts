// Сокращённые пары — режим «по осведомлённости пользователя».
// На сайте колледжа графика сокращёнки нет (о ней пишут в чатах), поэтому
// пользователь сам включает режим, когда знает, что пары сокращены.
// Включённый режим подменяет время пар во всём приложении: Сегодня, Неделя,
// Учителя, таймлайн во вкладке «Время», шеринг и картинка расписания.

import { useEffect, useState } from 'react'

export type PairTimes = Record<string, [string, string]>

const STORAGE_KEY = 'schedule:shortened'
const CHANGE_EVENT = 'schedule:shortened'

/** Обычное расписание звонков (фолбэк, пока schedule.json не загружен). */
export const NORMAL_PAIR_TIMES: PairTimes = {
  '1': ['08:00', '09:35'],
  '2': ['09:45', '11:20'],
  '3': ['11:45', '13:20'],
  '4': ['13:45', '15:20'],
  '5': ['15:30', '17:05'],
  '6': ['17:15', '18:50'],
}

/**
 * Сокращённые пары: 60 минут, перемены по 10 минут
 * (график колледжа «Режим работы»: 08:00–09:00, 09:10–10:10, … 13:50–14:50).
 */
export const SHORTENED_PAIR_TIMES: PairTimes = {
  '1': ['08:00', '09:00'],
  '2': ['09:10', '10:10'],
  '3': ['10:20', '11:20'],
  '4': ['11:30', '12:30'],
  '5': ['12:40', '13:40'],
  '6': ['13:50', '14:50'],
}

/** Включён ли режим сокращённых пар (персистится в localStorage). */
export function isShortenedEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setShortenedEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/** Времена пар с учётом режима: сокращённые — если включён, иначе обычные (base ?? NORMAL). */
export function activePairTimes(base?: PairTimes): PairTimes {
  return isShortenedEnabled() ? SHORTENED_PAIR_TIMES : (base ?? NORMAL_PAIR_TIMES)
}

/** Подписка на переключение режима (кнопка в «Времени» + другие вкладки через storage-событие). */
export function subscribeShortened(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback()
  }
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
  }
}

/** Реактивный доступ к режиму: [включён, переключить]. */
export function useShortened(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(isShortenedEnabled)

  useEffect(() => subscribeShortened(() => setOn(isShortenedEnabled())), [])

  const toggle = (value: boolean) => {
    setOn(value) // оптимистично — переключение мгновенное
    setShortenedEnabled(value)
  }
  return [on, toggle]
}
