import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { ALLERGENS } from '../data/allergens.js'
import { getStatus, statusLabel } from '../lib/time.js'

export function SafeImg({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src)
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br from-brand-100 to-brand-300 text-3xl ${className}`}
        role="img"
        aria-label={alt}
      >
        🐰
      </div>
    )
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  )
}

export function Logo({ className = 'h-9' }) {
  return <img src="logo.webp" alt="rabeat" className={`w-auto select-none ${className}`} draggable="false" />
}

// Reloj que se refresca cada minuto para recalcular abiertos/cerrados
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export function StatusPill({ restaurant, now, className = '' }) {
  const status = getStatus(restaurant, now)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        status.open ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-900 text-white'
      } ${className}`}
    >
      <span className={`size-1.5 rounded-full ${status.open ? 'bg-emerald-500 animate-pulse' : 'bg-brand-500'}`} />
      {statusLabel(status, now)}
    </span>
  )
}

export function AllergenChips({ allergens, size = 'sm' }) {
  if (!allergens.length)
    return <span className="text-[11px] font-medium text-emerald-700">Sin alérgenos declarados</span>
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Alérgenos">
      {allergens.map((a) => (
        <li
          key={a}
          title={ALLERGENS[a].name}
          className={`grid place-items-center rounded-full bg-amber-50 ring-1 ring-amber-200 ${
            size === 'sm' ? 'size-6 text-[13px]' : 'size-8 text-base'
          }`}
        >
          <span aria-label={ALLERGENS[a].name}>{ALLERGENS[a].icon}</span>
        </li>
      ))}
    </ul>
  )
}

export function QtyStepper({ value, onChange, min = 0, size = 'md' }) {
  const btn =
    size === 'sm'
      ? 'size-7 rounded-full'
      : 'size-10 rounded-full'
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btn} grid place-items-center bg-white text-ink shadow-sm transition active:scale-90`}
        aria-label={value - 1 < 1 && min === 0 ? 'Eliminar' : 'Quitar uno'}
      >
        <Icon name={value <= 1 && min === 0 ? 'trash' : 'minus'} className="size-4" />
      </button>
      <span className={`min-w-7 text-center font-bold tabular-nums ${size === 'sm' ? 'text-sm' : ''}`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`${btn} grid place-items-center bg-brand-600 text-white shadow-sm transition active:scale-90`}
        aria-label="Añadir uno"
      >
        <Icon name="plus" className="size-4" />
      </button>
    </div>
  )
}

// Hoja inferior en móvil, diálogo centrado en escritorio
export function Sheet({ open, onClose, children, label }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <button className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Cerrar" />
      <div className="relative max-h-[92dvh] w-full animate-slide-up overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-lg sm:animate-fade-in sm:rounded-[28px]">
        {children}
      </div>
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
