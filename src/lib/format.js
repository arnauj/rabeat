const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const money = (n) => eur.format(n)

export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(n))

export const SERVICE_FEE = 0.99

export const PROMO_CODES = {
  RABEAT10: { label: '10% de descuento', apply: (subtotal) => Math.round(subtotal * 10) / 100 },
  CONEJO: { label: '3 € de regalo', apply: (subtotal) => Math.min(3, subtotal) },
}
