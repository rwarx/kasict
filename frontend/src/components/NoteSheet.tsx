// Нижний лист редактирования заметки к паре.

import { useEffect, useState } from 'react'
import { getNote, setNote } from '../lib/notes'
import { CloseIcon, NoteIcon } from './Icons'

export function NoteSheet({ group, dateISO, pair, subject, onClose }: {
  group: string
  dateISO: string
  pair: number
  subject: string
  onClose: () => void
}) {
  const [text, setText] = useState(() => getNote(group, dateISO, pair)?.text ?? '')
  const hasExisting = text.trim().length > 0

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    setNote(group, dateISO, pair, text)
    onClose()
  }

  const remove = () => {
    setNote(group, dateISO, pair, '')
    onClose()
  }

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label={`Заметка к ${pair}-й паре`}>
      <div className="modal-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-handle" aria-hidden="true" />
        <h2 className="sheet-title">
          <NoteIcon size={18} /> Заметка · {pair}-я пара
        </h2>
        <div className="sheet-pair-info">{subject || 'Пара'}</div>

        <textarea
          className="note-textarea"
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Домашка, напоминание, что принести…"
          rows={4}
          maxLength={500}
          autoFocus
          aria-label="Текст заметки"
        />
        <div className="note-counter">{text.length}/500</div>

        <div className="note-actions">
          {hasExisting && (
            <button type="button" className="btn-ghost note-delete" onClick={remove}>
              Удалить
            </button>
          )}
          <button type="button" className="btn-solid btn-block note-save" onClick={save}>
            Сохранить
          </button>
        </div>

        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
          <CloseIcon size={17} />
        </button>
      </div>
    </div>
  )
}
