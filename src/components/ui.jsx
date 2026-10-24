import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { ALLERGENS } from '../data/allergens.js'
import { getStatus, statusLabel } from '../lib/time.js'
import { useSettings } from '../lib/settings.jsx'

export function SafeImg({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed || !src)
    return (
      <div className={`grid place-items-center bg-gradient-to-br from-brand-100 to-brand-300 text-3xl ${className}`} role="img" aria-label={alt}>
        🐰
      </div>
    )
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
}

export function Logo({ className = 'h-9' }) {
  return <img src="logo.webp" alt="rabeat" className={`w-auto select-none ${className}`} draggable="false" />
}

// Reloj que se refresca periódicamente para recalcular abiertos/cerrados
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export function useRestaurantStatus(restaurant, now) {
  const { settings } = useSettings()
  const status = getStatus(restaurant?.opening_hours ?? [], now, settings.timezone)
  return { ...status, label: statusLabel(status, now, settings.timezone), tz: settings.timezone }
}

export function StatusPill({ restaurant, now, className = '' }) {
  const status = useRestaurantStatus(restaurant, now)
  const paused = !restaurant.accepting_orders
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        status.open && !paused ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-900 text-white'
      } ${className}`}
    >
      <span className={`size-1.5 rounded-full ${status.open && !paused ? 'animate-pulse bg-emerald-500' : 'bg-brand-500'}`} />
      {paused ? 'Pedidos en pausa' : status.label}
    </span>
  )
}

export function AllergenChips({ allergens, size = 'sm' }) {
  if (!allergens?.length) return <span className="text-[11px] font-medium text-emerald-700">Sin alérgenos declarados</span>
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Alérgenos">
      {allergens.map((a) => (
        <li
          key={a}
          title={ALLERGENS[a]?.name}
          className={`grid place-items-center rounded-full bg-amber-50 ring-1 ring-amber-200 ${size === 'sm' ? 'size-6 text-[13px]' : 'size-8 text-base'}`}
        >
          <span aria-label={ALLERGENS[a]?.name}>{ALLERGENS[a]?.icon}</span>
        </li>
      ))}
    </ul>
  )
}

export function QtyStepper({ value, onChange, min = 0, size = 'md' }) {
  const btn = size === 'sm' ? 'size-7 rounded-full' : 'size-10 rounded-full'
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btn} grid place-items-center bg-white text-ink shadow-sm transition active:scale-90`}
        aria-label={value <= 1 && min === 0 ? 'Eliminar' : 'Quitar uno'}
      >
        <Icon name={value <= 1 && min === 0 ? 'trash' : 'minus'} className="size-4" />
      </button>
      <span className={`min-w-7 text-center font-bold tabular-nums ${size === 'sm' ? 'text-sm' : ''}`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(50, value + 1))}
        className={`${btn} grid place-items-center bg-brand-600 text-white shadow-sm transition active:scale-90`}
        aria-label="Añadir uno"
      >
        <Icon name="plus" className="size-4" />
      </button>
    </div>
  )
}

// Hoja inferior en móvil, diálogo centrado en escritorio
export function Sheet({ open, onClose, children, label, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <button className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Cerrar" />
      <div
        className={`relative max-h-[92dvh] w-full animate-slide-up overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:animate-fade-in sm:rounded-[28px] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export function SheetHeader({ title, subtitle, onClose }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-neutral-100 bg-white/95 px-5 pt-5 pb-4 backdrop-blur">
      <div>
        <h3 className="text-lg font-extrabold">{title}</h3>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100" aria-label="Cerrar">
        <Icon name="x" className="size-4" />
      </button>
    </div>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="font-display text-xl font-extrabold italic tracking-tight sm:text-2xl">{children}</h2>
      {action}
    </div>
  )
}

export function Button({ variant = 'primary', loading, className = '', children, ...props }) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700',
    dark: 'bg-ink text-white hover:bg-neutral-800',
    soft: 'bg-neutral-100 text-ink hover:bg-neutral-200',
    ghost: 'text-neutral-600 hover:bg-neutral-100',
    danger: 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50',
  }
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'size-6' }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`} />
}

export function Loading({ label = 'Cargando…' }) {
  return (
    <div className="grid place-items-center py-20 text-neutral-400">
      <Spinner className="size-8 text-brand-600" />
      <p className="mt-3 text-sm font-semibold">{label}</p>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-200">
      <p className="font-bold">Algo ha fallado</p>
      <p>{error.message ?? String(error)}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-bold underline">
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Empty({ icon = '🐰', title, children }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-neutral-200/70">
      <p className="text-4xl">{icon}</p>
      <p className="mt-3 font-extrabold">{title}</p>
      {children && <div className="mt-1 text-sm text-neutral-500">{children}</div>}
    </div>
  )
}

export function Field({ label, hint, error, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-xs font-bold text-neutral-500">{label}</span>}
      <input
        {...props}
        className={`w-full rounded-2xl bg-neutral-100 px-4 py-3 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-brand-500 ${
          error ? 'ring-2 ring-brand-500' : ''
        }`}
      />
      {(error || hint) && <span className={`mt-1 block text-xs ${error ? 'font-semibold text-brand-600' : 'text-neutral-500'}`}>{error || hint}</span>}
    </label>
  )
}

export function TextArea({ label, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-xs font-bold text-neutral-500">{label}</span>}
      <textarea
        {...props}
        className="w-full resize-none rounded-2xl bg-neutral-100 px-4 py-3 text-[15px] outline-none placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-xs font-bold text-neutral-500">{label}</span>}
      <select
        {...props}
        className="w-full appearance-none rounded-2xl bg-neutral-100 bg-[length:16px] bg-[right_14px_center] bg-no-repeat px-4 py-3 pr-10 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-brand-500"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {children}
      </select>
    </label>
  )
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {description && <span className="block text-xs text-neutral-500">{description}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-neutral-300 transition after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
    </label>
  )
}

export function Card({ title, icon, action, children, className = '' }) {
  return (
    <section className={`rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-base font-extrabold">
              {icon && (
                <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={icon} className="size-4" />
                </span>
              )}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ---------- Avisos (toasts) ----------
const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-in rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${
              t.kind === 'error' ? 'bg-brand-600 text-white' : 'bg-ink text-white'
            }`}
          >
            {t.kind === 'error' ? '⚠️ ' : '✓ '}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
