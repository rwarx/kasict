// Выбор группы: поиск, список, избранное (звёздочка), подсветка текущей группы.
// Используется и как полноэкранный шаг онбординга, и как модальное окно.

import { useMemo, useState } from 'react'
import { getGroups } from '../services/scheduleService'
import { getGroupFavorites, toggleGroupFavorite } from '../lib/groupFavorites'
import { CheckIcon, CloseIcon, SearchIcon, StarIcon } from './Icons'

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s|-/g, '')
}

export function GroupSelectBody({ current, onSelect }: {
  current: string | null
  onSelect: (g: string) => void
}) {
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => getGroupFavorites())
  const groups = useMemo(() => getGroups(), [])

  const toggleFav = (name: string) => setFavorites(toggleGroupFavorite(name))

  const favSet = useMemo(() => new Set(favorites), [favorites])
  const favoriteGroups = useMemo(
    () => groups.filter(g => favSet.has(g.name)),
    [groups, favSet],
  )
  const otherGroups = useMemo(
    () => groups.filter(g => !favSet.has(g.name)),
    [groups, favSet],
  )

  // При поиске — один список (избранные сверху); без поиска — секции.
  const searchResults = useMemo(
    () => {
      const q = normalize(query)
      return [...favoriteGroups, ...otherGroups].filter(g => normalize(g.name).includes(q))
    },
    [favoriteGroups, otherGroups, query],
  )

  const searching = query.trim().length > 0
  const hasFavorites = favoriteGroups.length > 0

  return (
    <>
      <div className="search-wrap">
        <SearchIcon size={18} className="search-icon" />
        <input
          className="search-input"
          placeholder="Поиск группы…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          aria-label="Поиск группы"
        />
      </div>

      {!searching && hasFavorites && (
        <>
          <div className="list-section-title">Избранное</div>
          <ul className="group-list favorites">
            {favoriteGroups.map(g => (
              <li key={g.name}>
                <GroupRow name={g.name} current={current} favorite onToggleFav={toggleFav} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          <div className="list-section-title">Все группы</div>
        </>
      )}

      <ul className="group-list">
        {(searching ? searchResults : otherGroups).map(g => (
          <li key={g.name}>
            <GroupRow
              name={g.name}
              current={current}
              favorite={favSet.has(g.name)}
              onToggleFav={toggleFav}
              onSelect={onSelect}
            />
          </li>
        ))}
        {(searching ? searchResults : otherGroups).length === 0 && (
          <li className="list-empty">
            {searching ? <>Группа «{query}» не найдена</> : <>Список групп пуст</>}
          </li>
        )}
      </ul>
    </>
  )
}

function GroupRow({ name, current, favorite, onToggleFav, onSelect }: {
  name: string
  current: string | null
  favorite: boolean
  onToggleFav: (name: string) => void
  onSelect: (g: string) => void
}) {
  const active = name === current
  return (
    <div className={`group-btn ${active ? 'current' : ''}`}>
      <button
        type="button"
        className="group-btn-main"
        onClick={() => onSelect(name)}
        aria-current={active || undefined}
      >
        <span>{name}</span>
        {active && <CheckIcon size={16} className="group-btn-check" />}
      </button>
      <button
        type="button"
        className={`group-btn-fav ${favorite ? 'active' : ''}`}
        onClick={e => { e.stopPropagation(); onToggleFav(name) }}
        aria-pressed={favorite}
        aria-label={favorite ? `Убрать «${name}» из избранного` : `Добавить «${name}» в избранное`}
        title={favorite ? 'Убрать из избранного' : 'В избранное'}
      >
        <StarIcon size={16} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

export function GroupSelectModal({ current, onSelect, onClose }: {
  current: string | null
  onSelect: (g: string) => void
  onClose: () => void
}) {
  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Выбор группы">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Выбор группы</h2>
            <p className="modal-subtitle">Найдите свою группу в списке</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>
        <GroupSelectBody current={current} onSelect={onSelect} />
      </div>
    </div>
  )
}
