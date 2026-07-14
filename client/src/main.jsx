import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// NOTE: StrictMode is intentionally omitted.
// React StrictMode double-invokes effects in development, which creates
// two Yjs WebSocket providers per tab (each with a unique clientID).
// With 2 real browser tabs that becomes 4 awareness entries → phantom users.
// Quill's imperative mount/unmount also doesn't survive double-invocation.
createRoot(document.getElementById('root')).render(<App />)

