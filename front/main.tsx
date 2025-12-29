import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './styles/globals.css'

/**
 * 智能右键菜单处理
 *
 * 默认禁用浏览器/Tauri 的右键菜单以使用自定义 React ContextMenu，
 * 但在以下情况允许默认行为以保持可用性：
 * - 用户在输入框 (input, textarea, [contenteditable]) 中
 * - 元素标记了 data-allow-context-menu 属性
 */
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement

  // 检查是否是可编辑元素
  const isEditable =
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('input, textarea, [contenteditable="true"]')

  // 检查是否明确允许默认右键菜单
  const allowContextMenu = target.closest('[data-allow-context-menu]')

  // 如果是可编辑元素或明确允许，则不阻止默认行为
  if (isEditable || allowContextMenu) {
    return
  }

  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
