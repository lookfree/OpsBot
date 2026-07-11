/**
 * Monaco 本地化配置(离线可用)
 *
 * 默认情况下 @monaco-editor/react 会在运行时从 CDN(jsdelivr)动态加载 Monaco
 * 脚本。而 Tauri 打包后的 CSP 是 `script-src 'self'`,该外部脚本会被拦截,导致
 * SQL 编辑器永远卡在 "Loading..." 且输入框无法渲染。
 *
 * 这里改为使用本地打包的 monaco-editor,并把 Monaco worker 指向 Vite 打包出的
 * 同源产物,保证完全离线可用(符合项目 Offline First 原则)。
 *
 * 注意:本文件必须在任何 Monaco 编辑器渲染之前以副作用方式导入。
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// 让 Monaco 使用本地打包的 worker,而不是从 CDN 拉取
;(self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

// 使用本地 monaco 实例,禁止走 CDN
loader.config({ monaco })
