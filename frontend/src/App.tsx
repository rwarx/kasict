import { useEffect, useState } from 'react'
import { getMeta, loadData } from './services/scheduleService'
import { handleNewData } from './services/notifications'
import { AppHeader } from './components/AppHeader'
import { BottomNav } from './components/BottomNav'
import { GroupSelectModal } from './components/GroupSelect'
import { ErrorScreen, LoadingScreen, OfflineBanner } from './components/StateViews'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { WeekScreen } from './screens/WeekScreen'
import { TeachersScreen } from './screens/TeachersScreen'
import { TimeScreen } from './screens/TimeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { OnboardingFlow } from './screens/Onboarding'
import type { Screen } from './types'
import { useTheme, type ThemePref } from './lib/theme'

const GROUP_KEY = 'schedule:group'
const ONBOARDING_KEY = 'schedule:onboarded'

export default function App() {
  const [group, setGroup] = useState<string | null>(() => localStorage.getItem(GROUP_KEY))
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === 'true')
  const [dateISO, setDateISO] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [screen, setScreen] = useState<Screen>('schedule')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupModal, setGroupModal] = useState(false)
  const { pref, setPref, accent, setAccent, isDark } = useTheme()

  useEffect(() => {
    loadData()
      .then(() => {
        setLoading(false)
        const meta = getMeta()
        if (meta) handleNewData(meta)
      })
      .catch(() => { setError('Не удалось загрузить данные'); setLoading(false) })
  }, [])

  const completeOnboarding = (selectedGroup: string) => {
    localStorage.setItem(GROUP_KEY, selectedGroup)
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setGroup(selectedGroup)
    setOnboarded(true)
  }

  const changeGroup = (newGroup: string) => {
    localStorage.setItem(GROUP_KEY, newGroup)
    setGroup(newGroup)
  }

  const cycleTheme = () => {
    const order: ThemePref[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(pref) + 1) % order.length]
    setPref(next)
  }

  if (!onboarded && !group) {
    return <OnboardingFlow onComplete={completeOnboarding} loading={loading} error={error} />
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (error) {
    return <ErrorScreen onRetry={() => window.location.reload()} />
  }

  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="container">
          <AppHeader
            group={group ?? '—'}
            onOpenGroup={() => setGroupModal(true)}
            pref={pref}
            onCycleTheme={cycleTheme}
            isDark={isDark}
          />

          <OfflineBanner show={!navigator.onLine} />

          {screen === 'schedule' && group && (
            <ScheduleScreen group={group} dateISO={dateISO} setDateISO={setDateISO} />
          )}
          {screen === 'week' && group && (
            <WeekScreen group={group} dateISO={dateISO} setDateISO={setDateISO} />
          )}
          {screen === 'teachers' && (
            <TeachersScreen dateISO={dateISO} setDateISO={setDateISO} />
          )}
          {screen === 'time' && <TimeScreen />}
          {screen === 'settings' && (
            <SettingsScreen
              group={group}
              onOpenGroupSelector={() => setGroupModal(true)}
              themePref={pref}
              onThemePref={setPref}
              accent={accent}
              onAccent={setAccent}
            />
          )}
        </div>
      </main>

      <BottomNav screen={screen} onChange={setScreen} />

      {groupModal && (
        <GroupSelectModal
          current={group}
          onSelect={(g) => { changeGroup(g); setGroupModal(false) }}
          onClose={() => setGroupModal(false)}
        />
      )}
    </div>
  )
}
