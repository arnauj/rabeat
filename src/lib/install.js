import { useEffect, useState } from 'react'

// Instalación de la app (PWA). Chrome/Android avisa con «beforeinstallprompt»;
// en iPhone/iPad no hay aviso y hay que explicar «Compartir → Añadir a pantalla de inicio».
let deferred = null
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

export function listenInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

const ua = () => navigator.userAgent
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isMobile = () => isIOS() || /Android|Mobi/i.test(ua())
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

const DISMISS_KEY = 'rabeat:install-dismissed'
const DISMISS_DAYS = 14

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY))
    return t && Date.now() - t < DISMISS_DAYS * 864e5
  } catch {
    return false
  }
}

export function useInstall() {
  const [, force] = useState(0)
  const [dismissed, setDismissed] = useState(dismissedRecently)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const installed = isStandalone()
  // nativo: el navegador muestra su diálogo; manual: hay que dar instrucciones (iOS, Firefox…)
  const mode = installed ? null : deferred ? 'native' : 'manual'
  return {
    mode,
    ios: isIOS(),
    // Invitar solo en el móvil, si no está instalada y no se ha descartado hace poco
    suggest: !installed && !dismissed && isMobile(),
    async install() {
      if (!deferred) return false
      deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      emit()
      return outcome === 'accepted'
    },
    dismiss() {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        /* sin almacenamiento */
      }
      setDismissed(true)
    },
  }
}
