// Настройки: группа, тема, уведомления, данные, приложение.

import { useState } from 'react'
import { getMeta } from '../services/scheduleService'
import { disableNotifications, enableNotifications, isNotifEnabled, isNotifSupported, notifStatusText } from '../services/notifications'
import type { AccentColor, ThemePref } from '../lib/theme'
import { ACCENT_OPTIONS } from '../lib/theme'
import { ChevronRightIcon, RefreshIcon } from '../components/Icons'

export function SettingsScreen({ group, onOpenGroupSelector, themePref, onThemePref, accent, onAccent }: {
  group: string | null
  onOpenGroupSelector: () => void
  themePref: ThemePref
  onThemePref: (p: ThemePref) => void
  accent: AccentColor
  onAccent: (a: AccentColor) => void
}) {
  const [pendingGroup, setPendingGroup] = useState(false)
  const [notifOn, setNotifOn] = useState(isNotifEnabled())
  const [notifStatus, setNotifStatus] = useState(notifStatusText())
  const meta = getMeta()

  const handleToggleNotif = async () => {
    if (!isNotifSupported()) return
    if (notifOn) {
      disableNotifications()
      setNotifOn(false)
    } else {
      const granted = await enableNotifications()
      setNotifOn(granted)
    }
    setNotifStatus(notifStatusText())
  }

  const themeOptions: { id: ThemePref; label: string }[] = [
    { id: 'system', label: 'Системная' },
    { id: 'light', label: 'Светлая' },
    { id: 'dark', label: 'Тёмная' },
  ]

  return (
    <>
      <section className="date-hero">
        <h1 className="date-title">Настройки</h1>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Группа</div>
        <div className="settings-card">
          <button type="button" className="settings-row" onClick={() => setPendingGroup(true)}>
            <div className="settings-row-info">
              <span className="settings-row-label">Моя группа</span>
              <span className="settings-row-value">{group || 'Не выбрана'}</span>
            </div>
            <ChevronRightIcon size={16} className="settings-row-arrow" />
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Оформление</div>
        <div className="settings-card">
          <div className="settings-row static">
            <div className="settings-row-info">
              <span className="settings-row-label">Тема</span>
            </div>
            <div className="seg-control" role="radiogroup" aria-label="Тема оформления">
              {themeOptions.map(o => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={themePref === o.id}
                  className={`seg-item ${themePref === o.id ? 'active' : ''}`}
                  onClick={() => onThemePref(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row static">
            <div className="settings-row-info">
              <span className="settings-row-label">Цвет акцента</span>
              <span className="settings-row-value">{ACCENT_OPTIONS.find(o => o.id === accent)?.label}</span>
            </div>
            <div className="accent-row" role="radiogroup" aria-label="Цвет акцента">
              {ACCENT_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={accent === o.id}
                  aria-label={o.label}
                  title={o.label}
                  className={`accent-swatch ${accent === o.id ? 'active' : ''}`}
                  style={{ backgroundColor: o.swatch }}
                  onClick={() => onAccent(o.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Уведомления</div>
        <div className="settings-card">
          <div className="settings-row static">
            <div className="settings-row-info">
              <span className="settings-row-label">О новом расписании</span>
              <span className="settings-row-value">{notifStatus}</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={notifOn}
                disabled={!isNotifSupported() || Notification.permission === 'denied'}
                onChange={handleToggleNotif}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Данные</div>
        <div className="settings-card">
          <div className="info-row">
            <span className="info-label">Групп в системе</span>
            <span className="info-value">{meta?.groups_count ?? '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Последнее обновление</span>
            <span className="info-value">
              {meta?.updated_at
                ? new Date(meta.updated_at).toLocaleString('ru-RU', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Замены доступны на</span>
            <span className="info-value">
              {meta?.replacement_dates?.length
                ? meta.replacement_dates.map(d => {
                    const date = new Date(d + 'T12:00:00')
                    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                  }).join(', ')
                : 'нет'}
            </span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Приложение</div>
        <div className="settings-card">
          <div className="info-row">
            <span className="info-label">Версия</span>
            <span className="info-value">3.0.0</span>
          </div>
          <div className="info-row">
            <span className="info-label">Источник данных</span>
            <span className="info-value">kasict.ru</span>
          </div>
        </div>
      </section>

      <button type="button" className="update-btn" onClick={() => window.location.reload()}>
        <RefreshIcon size={16} />
        Обновить данные
      </button>

      {pendingGroup && (
        <ConfirmDialog
          title="Изменить группу?"
          text="Расписание будет обновлено для новой группы."
          onCancel={() => setPendingGroup(false)}
          onConfirm={() => {
            setPendingGroup(false)
            onOpenGroupSelector()
          }}
        />
      )}
    </>
  )
}

function ConfirmDialog({ title, text, onCancel, onConfirm }: {
  title: string
  text: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-root" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="dialog-panel" onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-text">{text}</p>
        <div className="dialog-buttons">
          <button type="button" className="btn-ghost btn-block" onClick={onCancel}>Отмена</button>
          <button type="button" className="btn-solid btn-block" onClick={onConfirm}>Изменить</button>
        </div>
      </div>
    </div>
  )
}
