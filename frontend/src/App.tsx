import { useEffect, useState } from 'react'
import { getLastChanges, getMeta, loadData } from './services/scheduleService'
import { handleNewData } from './services/notifications'
import { AppHeader } from './components/AppHeader'
import { Fireworks } from './components/Fireworks'
import { shouldCelebrateDayX } from './lib/specialDays'
import { BottomNav } from './components/BottomNav'
import { GroupSelectModal } from './components/GroupSelect'
import { ErrorScreen, LoadingScreen, OfflineBanner } from './components/StateViews'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { WeekScreen } from './screens/WeekScreen'
import { TeachersScreen } from './screens/TeachersScreen'
import { TimeScreen } from './screens/TimeScreen'
import { ChatScreen } from './screens/ChatScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { OnboardingFlow } from './screens/Onboarding'
import type { Screen } from './types'
import { useTheme } from './lib/theme'
import { subscribeData } from './services/scheduleService'

const GROUP_KEY = 'schedule:group'
const ONBOARDING_KEY = 'schedule:onboarded'

const SCREEN_PARAMS: Record<string, Screen> = {
  today: 'schedule',
  schedule: 'schedule',
  week: 'week',
  teachers: 'teachers',
  time: 'time',
  chat: 'chat',
  settings: 'settings',
}

// Deep-link для App shortcuts / ярлыков: /?screen=week&date=2026-09-21
function initialScreen(): Screen {
  try {
    const param = new URLSearchParams(window.location.search).get('screen') ?? ''
    return SCREEN_PARAMS[param] ?? 'schedule'
  } catch {
    return 'schedule'
  }
}

function initialDateISO(): string {
  const fallback = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  try {
    const param = new URLSearchParams(window.location.search).get('date') ?? ''
    return /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : fallback()
  } catch {
    return fallback()
  }
}

export default function App() {
  const [group, setGroup] = useState<string | null>(() => localStorage.getItem(GROUP_KEY))
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDING_KEY) === 'true')
  const [dateISO, setDateISO] = useState(initialDateISO)
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupModal, setGroupModal] = useState(false)
  const [dayXShow, setDayXShow] = useState(false)
  const [toast, setToast] = useState('')
  // Сегодняшняя дата не меняется за время жизни страницы — вычисляем один раз
  const [today] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const isDayXToday = shouldCelebrateDayX(today)
  const { pref, setPref, isDark, season } = useTheme()

  // День X: при открытии приложения 18 сентября — салют (всегда включён)
  useEffect(() => {
    if (shouldCelebrateDayX(today)) {
      setDayXShow(true)
    }
  }, [today])

  useEffect(() => {
    loadData()
      .then(() => {
        setLoading(false)
        const meta = getMeta()
        if (meta) void handleNewData(meta, getLastChanges())
      })
      .catch(() => { setError('Не удалось загрузить данные'); setLoading(false) })

    // Фоновая сверка замен: данные могли обновиться пока приложение было закрыто
    const unsubscribe = subscribeData(() => {
      const meta = getMeta()
      if (meta) void handleNewData(meta, getLastChanges())
      const changes = getLastChanges()
      if (changes && changes.added + changes.cancelled + changes.changed > 0) {
        setToast('Расписание обновлено — показаны свежие данные')
        window.setTimeout(() => setToast(''), 4000)
      }
    })
    return unsubscribe
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

  const toggleTheme = () => {
    setPref(isDark ? 'light' : 'dark')
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
            onToggleTheme={toggleTheme}
            isDark={isDark}
            dayX={isDayXToday}
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
          {screen === 'chat' && <ChatScreen group={group} />}
          {screen === 'settings' && (
            <SettingsScreen
              group={group}
              onOpenGroupSelector={() => setGroupModal(true)}
              themePref={pref}
              onThemePref={setPref}
              season={season}
              onViewSchedule={() => setScreen('schedule')}
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

      {dayXShow && <Fireworks onClose={() => setDayXShow(false)} />}

      {toast && <div className="app-toast" role="status">{toast}</div>}
    </div>
  )
}
