import { useState } from 'react'
import Icon from './Icon.jsx'
import { Sheet, SheetHeader, useToast } from './ui.jsx'
import { useInstall } from '../lib/install.js'

// Invitación a instalar rabeat en la pantalla de inicio (solo en el móvil)
export function InstallBanner({ className = '' }) {
  const app = useInstall()
  const [help, setHelp] = useState(false)
  if (!app.suggest) return null
  return (
    <>
      <div className={`flex items-center gap-3 rounded-3xl bg-white p-3 pr-2 shadow-sm ring-1 ring-neutral-200/70 ${className}`}>
        <img src="icon-192.png" alt="" className="size-12 shrink-0 rounded-2xl ring-1 ring-neutral-200" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">Instala la app de rabeat</p>
          <p className="text-xs text-neutral-500">Ábrela desde tu pantalla de inicio, más rápido.</p>
        </div>
        <InstallButton app={app} onHelp={() => setHelp(true)} />
        <button onClick={app.dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-400" aria-label="Ahora no">
          <Icon name="plus" className="size-4 rotate-45" />
        </button>
      </div>
      <InstallHelp open={help} onClose={() => setHelp(false)} ios={app.ios} />
    </>
  )
}

// Tarjeta para la página de cuenta (también fuera del móvil)
export function InstallCard() {
  const app = useInstall()
  const [help, setHelp] = useState(false)
  if (!app.mode) return null
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/70">
      <img src="icon-192.png" alt="" className="size-12 shrink-0 rounded-2xl ring-1 ring-neutral-200" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">App de rabeat</p>
        <p className="text-xs text-neutral-500">Añádela a tu pantalla de inicio o escritorio.</p>
      </div>
      <InstallButton app={app} onHelp={() => setHelp(true)} />
      <InstallHelp open={help} onClose={() => setHelp(false)} ios={app.ios} />
    </div>
  )
}

function InstallButton({ app, onHelp }) {
  const toast = useToast()
  const click = async () => {
    if (app.mode !== 'native') return onHelp()
    if (await app.install()) toast('¡rabeat instalada! Ya la tienes en tu pantalla de inicio')
  }
  return (
    <button onClick={click} className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md shadow-brand-600/25 active:scale-95">
      <Icon name="download" className="size-4" /> Instalar
    </button>
  )
}

function InstallHelp({ open, onClose, ios }) {
  const steps = ios
    ? [
        ['share', <>Pulsa el botón <b>Compartir</b> de Safari (el cuadrado con la flecha, abajo o arriba).</>],
        ['plus', <>Elige <b>Añadir a pantalla de inicio</b>. Si no lo ves, desliza la lista hacia abajo.</>],
        ['download', <>Pulsa <b>Añadir</b>. rabeat aparecerá como una app más.</>],
      ]
    : [
        ['settings', <>Abre el <b>menú del navegador</b> (los tres puntos ⋮).</>],
        ['download', <>Pulsa <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</>],
        ['plus', <>Confirma con <b>Instalar</b>. rabeat aparecerá como una app más.</>],
      ]
  return (
    <Sheet open={open} onClose={onClose} label="Instalar rabeat">
      <SheetHeader title="Instalar rabeat" subtitle={ios ? 'En iPhone y iPad, desde Safari' : 'Desde tu navegador'} onClose={onClose} />
      <ol className="space-y-3 p-5">
        {steps.map(([icon, text], i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name={icon} className="size-5" />
            </span>
            <p className="pt-2 text-sm">
              <b className="mr-1 text-brand-600">{i + 1}.</b>
              {text}
            </p>
          </li>
        ))}
      </ol>
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button onClick={onClose} className="w-full rounded-2xl bg-ink py-3.5 font-extrabold text-white">
          Entendido
        </button>
      </div>
    </Sheet>
  )
}
