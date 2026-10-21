import TopBar from '../components/TopBar.jsx'
import Icon from '../components/Icon.jsx'
import { SafeImg, SectionTitle, useNow } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { money } from '../lib/format.js'
import { orderProgress, STAGES } from '../lib/orders.js'
import { slotLabel } from '../lib/time.js'

export default function Orders() {
  const { orders } = useCart()
  const now = useNow(5000)

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-xl px-4 py-6">
        <SectionTitle>Mis pedidos</SectionTitle>
        {orders.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-neutral-200/70">
            <img src="rider.png" alt="" className="mx-auto w-32" />
            <p className="mt-3 font-extrabold">Todavía no has pedido nada</p>
            <p className="text-sm text-neutral-500">Tu rider está calentando motores.</p>
            <a href="#/" className="mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">
              Pedir ahora
            </a>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const p = orderProgress(o, now)
              const label = p.scheduled ? 'Programado' : STAGES[p.stageIndex].label
              const done = p.stageIndex === STAGES.length - 1
              return (
                <li key={o.id}>
                  <a
                    href={`#/pedido/${o.id}`}
                    className="flex items-center gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 transition hover:shadow-lg"
                  >
                    <SafeImg src={o.cover} alt="" className="size-16 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{o.restaurantName}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {o.items.reduce((n, i) => n + i.qty, 0)} productos · {money(o.total)}
                      </p>
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          p.scheduled
                            ? 'bg-neutral-900 text-white'
                            : done
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-brand-50 text-brand-700'
                        }`}
                      >
                        {p.scheduled && <Icon name="calendar" className="size-3" />}
                        {label}
                        {p.scheduled && ` · ${slotLabel(new Date(o.scheduledFor), now)}`}
                      </span>
                    </div>
                    <Icon name="right" className="size-5 text-neutral-400" />
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
