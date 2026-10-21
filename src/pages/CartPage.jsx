import TopBar from '../components/TopBar.jsx'
import CartPanel from '../components/CartPanel.jsx'
import { SectionTitle } from '../components/ui.jsx'

export default function CartPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-xl px-4 py-6">
        <SectionTitle>Tu cesta</SectionTitle>
        <CartPanel />
        <a href="#/" className="mt-5 block text-center text-sm font-semibold text-brand-600">
          Seguir explorando restaurantes
        </a>
      </main>
    </>
  )
}
