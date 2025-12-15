import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './styles/globals.css'

// 禁用浏览器/Tauri 默认的右键菜单，使用自定义的 React ContextMenu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
