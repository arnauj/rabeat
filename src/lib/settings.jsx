import { createContext, useContext, useEffect, useState } from 'react'
import { callFunction, supabase } from './supabase.js'
import { DEFAULT_TZ } from './time.js'

const FALLBACK = {
  restaurant_commission_pct: 15,
  price_markup_pct: 0,
  delivery_base_fee: 1.5,
  delivery_fee_per_km: 0.6,
  delivery_max_km: 10,
  max_tip: 50,
  dine_in_commission_pct: 5,
  dine_in_markup_pct: 0,
  igic_pct: 7,
  timezone: DEFAULT_TZ,
}

const SettingsContext = createContext({ settings: FALLBACK, config: null, reload: () => {} })

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [config, setConfig] = useState(null)

  const reload = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data) setSettings(data)
  }

  useEffect(() => {
    reload()
    callFunction('public-config')
      .then(setConfig)
      .catch(() => setConfig({ payments: 'test', email: false }))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings: settings ?? FALLBACK, loaded: !!settings, config, reload }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
