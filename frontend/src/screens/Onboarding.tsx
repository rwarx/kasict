// Онбординг: приветствие → выбор группы → готово.
// Ключи localStorage (schedule:group, schedule:onboarded) сохранены.

import { useState } from 'react'
import { GroupSelectBody } from '../components/GroupSelect'
import { CheckIcon } from '../components/Icons'
import { ErrorScreen, LoadingScreen } from '../components/StateViews'

export function OnboardingFlow({ onComplete, loading, error }: {
  onComplete: (group: string) => void
  loading: boolean
  error: string
}) {
  const [step, setStep] = useState<'welcome' | 'select' | 'success'>('welcome')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen onRetry={() => window.location.reload()} />

  if (step === 'welcome') {
    return (
      <div className="onboarding">
        <div className="onboarding-brand" aria-hidden="true">KASICT</div>
        <div className="onboarding-content">
          <div className="onboarding-glyph" aria-hidden="true">
            <span>8:30</span>
          </div>
          <h1 className="onboarding-title">Расписание,<br />которое всегда с тобой</h1>
          <p className="onboarding-text">
            Актуальные пары, замены и отмены —
            в чистом интерфейсе. Настройка займёт секунды.
          </p>
          <button type="button" className="btn-solid btn-block" onClick={() => setStep('select')} disabled={loading}>
            Начать
          </button>
        </div>
      </div>
    )
  }

  if (step === 'select') {
    return (
      <div className="onboarding">
        <div className="onboarding-brand" aria-hidden="true">KASICT</div>
        <div className="onboarding-select">
          <h1 className="onboarding-title">Выбери группу</h1>
          <p className="onboarding-text left">Найди свою группу в списке — она сохранится автоматически.</p>
          <GroupSelectBody current={null} onSelect={(g) => { setSelectedGroup(g); setStep('success') }} />
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding center">
      <div className="onboarding-content">
        <div className="success-icon" aria-hidden="true"><CheckIcon size={34} /></div>
        <h1 className="onboarding-title">{selectedGroup}</h1>
        <p className="onboarding-text">Отлично! Теперь это твоя группа.</p>
        <button type="button" className="btn-solid btn-block" onClick={() => onComplete(selectedGroup!)}>
          Посмотреть расписание
        </button>
      </div>
    </div>
  )
}
