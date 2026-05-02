import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@app/index.css'
import App from './App.jsx'

document.documentElement.dataset.liwuClient = 'web'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
