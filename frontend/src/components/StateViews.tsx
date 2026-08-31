// Состояния: загрузка (skeleton), ошибка, пустой день, офлайн-баннер.

import { RefreshIcon, WifiOffIcon } from './Icons'

export function LoadingScreen() {
  return (
    <div className="container" style={{ paddingTop: 8 }}>
      <div className="skeleton hero-skeleton" />
      <div className="skeleton-strip">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton day-skeleton" />)}
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-line w-30" />
          <div className="skeleton skeleton-line w-70" />
          <div className="skeleton skeleton-line w-50" />
        </div>
      ))}
    </div>
  )
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-wrap">
      <div className="state-icon danger" aria-hidden="true">!</div>
      <h2 className="state-title">Не удалось загрузить</h2>
      <p className="state-text">
        Похоже, сайт колледжа временно недоступен, а локального кэша пока нет.
        Попробуйте ещё раз.
      </p>
      <button type="button" className="btn-solid state-btn" onClick={onRetry}>
        <RefreshIcon size={16} />
        Повторить
      </button>
    </div>
  )
}

export function EmptyDay({ dateLabel }: { dateLabel: string }) {
  return (
    <div className="state-wrap">
      <div className="state-icon success" aria-hidden="true">✓</div>
      <h2 className="state-title">Пар нет</h2>
      <p className="state-text">На {dateLabel} занятий не запланировано — можно отдыхать.</p>
    </div>
  )
}

export function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="offline-banner" role="status">
      <WifiOffIcon size={15} />
      <span>Нет сети — показаны сохранённые данные</span>
    </div>
  )
}
