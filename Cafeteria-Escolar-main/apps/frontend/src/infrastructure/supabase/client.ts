import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && publishableKey)

const rememberSessionPreferenceKey = 'cafe-escuela:remember-session'

function canUseBrowserStorage() {
  return typeof window !== 'undefined'
}

function readRememberSessionPreference() {
  if (!canUseBrowserStorage()) return true

  try {
    return window.localStorage.getItem(rememberSessionPreferenceKey) !== 'false'
  } catch {
    return true
  }
}

let rememberSession = readRememberSessionPreference()

export function getRememberSessionPreference() {
  return rememberSession
}

export function setRememberSessionPreference(remember: boolean) {
  rememberSession = remember

  if (!canUseBrowserStorage()) return

  try {
    window.localStorage.setItem(rememberSessionPreferenceKey, String(remember))
  } catch {
    // La autenticación sigue funcionando si el navegador bloquea el almacenamiento.
  }
}

const authStorage = {
  getItem(key: string) {
    if (!canUseBrowserStorage()) return null

    try {
      return (rememberSession ? window.localStorage : window.sessionStorage).getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    if (!canUseBrowserStorage()) return

    try {
      const storage = rememberSession ? window.localStorage : window.sessionStorage
      const otherStorage = rememberSession ? window.sessionStorage : window.localStorage
      storage.setItem(key, value)
      otherStorage.removeItem(key)
    } catch {
      // Supabase reportará el fallo de almacenamiento si la escritura no fue posible.
    }
  },
  removeItem(key: string) {
    if (!canUseBrowserStorage()) return

    try {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    } catch {
      // El cierre de sesión también invalida la sesión en Supabase.
    }
  },
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: authStorage,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}
