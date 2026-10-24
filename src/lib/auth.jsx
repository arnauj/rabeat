import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

  const loadProfile = useCallback(async (user) => {
    if (!user) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // fuera del callback para no bloquear el cliente de auth
      setTimeout(() => loadProfile(s?.user), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value = useMemo(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.active ? profile.role : null,
      isStaff: ['superuser', 'restaurant'].includes(profile?.role) && profile?.active,
      refreshProfile: () => loadProfile(session?.user),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
      },
      signUp: async ({ email, password, full_name, phone }) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name, phone } },
        })
        if (error) throw new Error(error.message.includes('registered') ? 'Ya existe una cuenta con ese email' : error.message)
        return data
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}${window.location.pathname}#/cuenta`,
        })
        if (error) throw new Error(error.message)
      },
      signOut: () => supabase.auth.signOut(),
    }),
    [ready, session, profile, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
