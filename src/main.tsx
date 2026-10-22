import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jost'
import './index.css'
import App from './App.tsx'

// In dev mode, unregister any lingering service workers so stale caches
// never cause the app to get stuck on the loading screen.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      void reg.unregister()
    }
  })
}

const root = createRoot(document.getElementById('root')!)

// DEV ONLY: ?preview=<screen> renders a screen with sample data (no sign-in).
// The branch is removed from production builds.
const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') : null
if (preview === 'home') {
  void import('./dev/HomePreview').then(({ HomePreview }) => {
    root.render(<StrictMode><HomePreview /></StrictMode>)
  })
} else if (preview) {
  void import('./dev/ScreenPreview').then(({ ScreenPreview }) => {
    root.render(<StrictMode><ScreenPreview screen={preview} /></StrictMode>)
  })
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
