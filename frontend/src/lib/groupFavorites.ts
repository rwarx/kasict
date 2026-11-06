// Избранные группы: персист в localStorage, порядок добавления сохраняется.
// Ключ в общем стиле приложения (префикс schedule:).

const KEY = 'schedule:group_favorites'

export function getGroupFavorites(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function saveFavorites(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Приватный режим / переполнение — избранное просто не сохранится.
  }
}

/** Переключает группу в избранном и возвращает новый список. */
export function toggleGroupFavorite(name: string): string[] {
  const list = getGroupFavorites()
  const next = list.includes(name)
    ? list.filter(x => x !== name)
    : [...list, name]
  saveFavorites(next)
  return next
}
