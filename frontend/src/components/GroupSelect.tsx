// Выбор группы: поиск, список, подсветка текущей группы.
// Используется и как полноэкранный шаг онбординга, и как модальное окно.

import { useMemo, useState } from 'react'
import { getGroups } from '../services/scheduleService'
import { CheckIcon, CloseIcon, SearchIcon } from './Icons'

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s|-/g, '')
}

export function GroupSelectBody({ current, onSelect }: {
  current: string | null
  onSelect: (g: string) => void
}) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => getGroups(), [])

  const filtered = useMemo(
    () => groups.filter(g => normalize(g.name).includes(normalize(query))),
    [groups, query],
  )

  const popular = useMemo(() => groups.slice(0, 5), [groups])

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

      {!query && (
        <>
          <div className="list-section-title">Популярные</div>
          <ul className="group-list" style={{ marginBottom: 20 }}>
            {popular.map(g => (
              <li key={g.name}>
                <GroupButton name={g.name} current={current} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          <div className="list-section-title">Все группы</div>
        </>
      )}

      <ul className="group-list">
        {filtered.map(g => (
          <li key={g.name}>
            <GroupButton name={g.name} current={current} onSelect={onSelect} />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="list-empty">Группа «{query}» не найдена</li>
        )}
      </ul>
    </>
  )
}

function GroupButton({ name, current, onSelect }: {
  name: string
  current: string | null
  onSelect: (g: string) => void
}) {
  const active = name === current
  return (
    <button
      type="button"
      className={`group-btn ${active ? 'current' : ''}`}
      onClick={() => onSelect(name)}
      aria-current={active || undefined}
    >
      <span>{name}</span>
      {active && <CheckIcon size={16} className="group-btn-check" />}
    </button>
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
