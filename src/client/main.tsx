import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'tldraw/tldraw.css'
import './index.css'
import './pwa'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
