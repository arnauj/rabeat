import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Card, Spinner, useToast } from '../components/ui.jsx'
import { callFunction } from '../lib/supabase.js'

// Estado de la cuenta Express de un restaurante (null mientras carga)
export const connectState = (account) =>
  !account ? 'none' : account.transfers_active ? 'active' : account.details_submitted ? 'review' : 'pending'

export const CONNECT_BADGE = {
  active: { label: 'Stripe activo', className: 'bg-emerald-50 text-emerald-700' },
  review: { label: 'Stripe en revisión', className: 'bg-amber-50 text-amber-700' },
  pending: { label: 'Stripe a medias', className: 'bg-amber-50 text-amber-700' },
  none: { label: 'Sin Stripe', className: 'bg-neutral-100 text-neutral-600' },
}

// Parámetro ?stripe=vuelta|renovar con el que Stripe devuelve al restaurante tras el alta
function returnParam() {
  const query = window.location.hash.split('?')[1] ?? ''
  return new URLSearchParams(query).get('stripe')
}
function clearReturnParam() {
  const [path] = window.location.hash.split('?')
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${path}`)
}

// Cobros con Stripe Connect: el restaurante recibe su parte de cada pago online directamente en su cuenta
export default function StripeConnectCard({ restaurant: r }) {
  const toast = useToast()
  const [state, setState] = useState(null) // { enabled, account }
  const [busy, setBusy] = useState(null) // 'onboard' | 'dashboard'
  const handled = useRef(false)

  const go = async (action) => {
    setBusy(action)
    try {
      const { url } = await callFunction('stripe-connect', { action, restaurant_id: r.id })
      window.location.href = url
    } catch (e) {
      toast(e.message, 'error')
      setBusy(null)
    }
  }

  useEffect(() => {
    let alive = true
    const param = handled.current ? null : returnParam()
    handled.current = true
    // El enlace de alta caduca: Stripe vuelve con «renovar» y se genera uno nuevo
    if (param === 'renovar') {
      clearReturnParam()
      go('onboard')
      return
    }
    callFunction('stripe-connect', { action: 'status', restaurant_id: r.id })
      .then((res) => {
        if (!alive) return
        setState(res)
        if (param === 'vuelta') {
          clearReturnParam()
          const s = connectState(res.account)
          toast(s === 'active' ? '¡Listo! Ya cobras directamente en tu cuenta de Stripe' : s === 'review' ? 'Stripe está revisando tus datos' : 'Te faltan datos por completar en Stripe')
        }
      })
      .catch((e) => alive && setState({ error: e.message }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id])

  const s = state?.account !== undefined ? connectState(state.account) : null
  const due = state?.account?.requirements_due?.length ?? 0

  return (
    <Card
      title="Cobros"
      icon="card"
      action={s && state.enabled && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CONNECT_BADGE[s].className}`}>{CONNECT_BADGE[s].label}</span>}
    >
      {!state ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner className="size-4" /> Comprobando tu cuenta de Stripe…
        </div>
      ) : state.error ? (
        <p className="rounded-2xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">{state.error}</p>
      ) : !state.enabled ? (
        <p className="text-sm text-neutral-600">
          Los pagos online están en <b>modo pruebas</b>. Cuando rabeat active Stripe podrás conectar tu cuenta para cobrar directamente.
        </p>
      ) : s === 'active' ? (
        <>
          <div className="flex gap-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <Icon name="check" className="mt-0.5 size-5 shrink-0" />
            <p>
              <b>Cobros automáticos activos.</b> En cada pago online Stripe te transfiere al momento tu parte (ventas − comisión + IGIC) y las propinas de
              tu equipo. {state.account.payouts_enabled ? 'Llega a tu banco según el calendario de Stripe.' : 'Stripe aún no ha verificado tu cuenta bancaria.'}
            </p>
          </div>
          {due > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">Stripe te pide {due === 1 ? 'un dato más' : `${due} datos más`}: complétalos para no perder los cobros.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="dark" className="flex-1 !py-2.5" loading={busy === 'dashboard'} onClick={() => go('dashboard')}>
              Ver mis cobros en Stripe
            </Button>
            {due > 0 && (
              <Button variant="soft" className="flex-1 !py-2.5" loading={busy === 'onboard'} onClick={() => go('onboard')}>
                Completar datos
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Conecta una cuenta de Stripe y cobra <b>directamente</b>: en cada pedido pagado online recibes tu parte al instante, sin esperar a la liquidación de
            rabeat. Las comisiones de Stripe las paga rabeat.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-neutral-500">
            <li className="flex gap-2"><Icon name="check" className="size-4 shrink-0 text-emerald-600" />Alta de unos 5 minutos: datos fiscales, DNI o CIF e IBAN</li>
            <li className="flex gap-2"><Icon name="check" className="size-4 shrink-0 text-emerald-600" />Panel propio de Stripe con todos tus cobros</li>
            <li className="flex gap-2"><Icon name="check" className="size-4 shrink-0 text-emerald-600" />Mientras tanto se te sigue liquidando como hasta ahora</li>
          </ul>
          {s === 'review' && (
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {due ? `Stripe necesita ${due === 1 ? 'un dato más' : `${due} datos más`} para activar tus cobros.` : 'Stripe está verificando tus datos. Suele tardar unos minutos.'}
            </p>
          )}
          <Button className="mt-4 w-full" loading={busy === 'onboard'} onClick={() => go('onboard')}>
            {s === 'none' ? 'Conectar con Stripe' : 'Continuar el alta en Stripe'}
            <Icon name="right" className="size-4" />
          </Button>
        </>
      )}
    </Card>
  )
}
