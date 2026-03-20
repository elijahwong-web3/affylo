const AUTH_STORAGE_KEY = 'group-chart-auth'

export function useAuth() {
  const config = useRuntimeConfig().public
  const appPassword = (config.appPassword as string) || ''
  const passwordRequired = computed(() => appPassword.length > 0)

  const authenticated = useState('group-chart-auth-authenticated', () => ref(false))
  const authReady = useState('group-chart-auth-ready', () => ref(false))

  function loadSession() {
    if (typeof window === 'undefined') return
    if (!passwordRequired.value) {
      authenticated.value = true
    } else {
      authenticated.value = sessionStorage.getItem(AUTH_STORAGE_KEY) === '1'
    }
  }

  function checkPassword(plain: string): boolean {
    if (!appPassword) {
      authenticated.value = true
      return true
    }
    if (plain.trim() !== appPassword) {
      return false
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(AUTH_STORAGE_KEY, '1')
    }
    authenticated.value = true
    return true
  }

  function logout() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
    }
    authenticated.value = false
  }

  if (import.meta.client) {
    loadSession()
    nextTick(() => {
      authReady.value = true
    })
  }

  return {
    passwordRequired,
    authenticated,
    authReady,
    checkPassword,
    logout
  }
}
