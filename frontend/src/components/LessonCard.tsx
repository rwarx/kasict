// Карточка пары + нижний лист с деталями замены.

import type { LessonView } from '../services/replacementEngine'
import { LaptopIcon, PinIcon, SwapIcon, UserIcon } from './Icons'

const STATUS_META: Record<string, { label: string; kind: string }> = {
  replaced: { label: 'Замена', kind: 'warn' },
  teacher_changed: { label: 'Преподаватель', kind: 'info' },
  room_changed: { label: 'Кабинет', kind: 'info' },
  cancelled: { label: 'Отменено', kind: 'danger' },
  added: { label: 'Добавлено', kind: 'success' },
}

export function LessonCard({ lesson, onClick }: { lesson: LessonView; onClick: () => void }) {
  const changed = lesson.status !== 'normal'
  const cancelled = lesson.status === 'cancelled'
  const statusMeta = changed ? STATUS_META[lesson.status] : null

  return (
    <article
      className={[
        'lesson-card',
        lesson.status,
        changed ? 'clickable' : '',
      ].join(' ').trim()}
      onClick={changed ? onClick : undefined}
      role={changed ? 'button' : undefined}
      tabIndex={changed ? 0 : undefined}
      onKeyDown={changed ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      aria-label={changed ? `${lesson.subject || 'Пара'} — показать детали замены` : undefined}
    >
      <div className="lesson-time-col">
        <span className="lesson-time-start">{lesson.time_start}</span>
        <span className="lesson-time-end">{lesson.time_end}</span>
      </div>
      <div className="lesson-body">
        <div className="lesson-top-row">
          <span className="lesson-num">#{lesson.number}</span>
          {statusMeta && <span className={`badge ${statusMeta.kind}`}>{statusMeta.label}</span>}
        </div>

        {cancelled ? (
          <div className="lesson-cancelled">
            <s className="lesson-subject">{lesson.original?.subject || 'Пара'}</s>
            <span className="lesson-cancelled-note">Пара отменена</span>
          </div>
        ) : (
          <>
            <div className="lesson-subject">{lesson.subject || '—'}</div>
            <div className="lesson-meta">
              {lesson.teacher && (
                lesson.status === 'teacher_changed' && lesson.original?.teacher ? (
                  <span className="lesson-change">
                    <s>{lesson.original.teacher}</s>
                    <span className="lesson-change-arrow" aria-hidden="true">→</span>
                    {lesson.teacher}
                  </span>
                ) : (
                  <span className="lesson-meta-item"><UserIcon size={14} />{lesson.teacher}</span>
                )
              )}
              {lesson.is_remote ? (
                <span className="lesson-meta-item"><LaptopIcon size={14} />Дистанционно</span>
              ) : lesson.classroom && (
                lesson.status === 'room_changed' && lesson.original?.classroom ? (
                  <span className="lesson-change">
                    <s>{lesson.original.classroom} каб.</s>
                    <span className="lesson-change-arrow" aria-hidden="true">→</span>
                    {lesson.classroom} каб.
                  </span>
                ) : (
                  <span className="lesson-meta-item"><PinIcon size={14} />{lesson.classroom} каб.</span>
                )
              )}
            </div>
          </>
        )}

        {changed && !cancelled && (
          <div className="lesson-details-hint">
            <SwapIcon size={13} />
            Подробности
          </div>
        )}
      </div>
    </article>
  )
}

export function ReplacementSheet({ lesson, onClose }: { lesson: LessonView; onClose: () => void }) {
  const title = lesson.status === 'cancelled' ? 'Отмена'
    : lesson.status === 'added' ? 'Дополнительная пара'
      : lesson.status === 'replaced' ? 'Замена предмета'
        : lesson.status === 'teacher_changed' ? 'Замена преподавателя'
          : 'Замена кабинета'

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-handle" aria-hidden="true" />
        <h2 className="sheet-title">{title}</h2>
        <div className="sheet-pair-info">
          {lesson.number} пара · {lesson.time_start} — {lesson.time_end}
        </div>

        {lesson.original ? (
          <div className="change-flow">
            <div className="change-block was">
              <div className="change-block-label">Было</div>
              <div className="change-block-subject">{lesson.original.subject || '—'}</div>
              <div className="change-block-meta">
                {lesson.original.teacher && <span>{lesson.original.teacher}</span>}
                {lesson.original.classroom && <span> · {lesson.original.classroom} каб.</span>}
              </div>
            </div>
            <div className="change-arrow" aria-hidden="true">↓</div>
            <div className={`change-block now ${lesson.status === 'cancelled' ? 'cancelled' : ''}`}>
              <div className="change-block-label">Стало</div>
              {lesson.status === 'cancelled' ? (
                <div className="change-block-subject danger">Отменено</div>
              ) : (
                <>
                  <div className="change-block-subject">{lesson.subject}</div>
                  <div className="change-block-meta">
                    {lesson.teacher && <span>{lesson.teacher}</span>}
                    {lesson.classroom && <span> · {lesson.classroom} каб.</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="change-block now">
            <div className="change-block-label">Новая пара</div>
            <div className="change-block-subject">{lesson.subject || '—'}</div>
            <div className="change-block-meta">
              {lesson.teacher && <span>{lesson.teacher}</span>}
              {lesson.classroom && <span> · {lesson.classroom} каб.</span>}
            </div>
          </div>
        )}

        <button type="button" className="btn-solid btn-block" onClick={onClose}>Понятно</button>
      </div>
    </div>
  )
}
