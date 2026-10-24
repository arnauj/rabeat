import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { SettingsProvider } from './lib/settings.jsx'
import { LocationProvider } from './lib/location.jsx'
import { CartProvider } from './lib/cart.jsx'
import { ToastProvider } from './components/ui.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>
          <LocationProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </LocationProvider>
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
