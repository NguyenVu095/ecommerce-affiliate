import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Guard rõ ràng thay vì non-null assertion (!) để tránh lỗi mơ hồ
// nếu template HTML thiếu phần tử #root.
const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root không tìm thấy trong DOM.')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
