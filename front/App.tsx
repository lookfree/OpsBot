/**
 * ZWD-OpsBot 主应用组件
 */

import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar, MainContent, StatusBar } from '@/components/layout'
import { useThemeStore } from '@/stores'

function App() {
  const { theme } = useThemeStore()

  // 初始化主题
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(theme)
    document.body.classList.remove('dark', 'light')
    document.body.classList.add(theme)
  }, [theme])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-dark-bg-primary dark:bg-dark-bg-primary light:bg-light-bg-primary">
      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="main-layout">
          {/* 侧边栏 */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={40}
            className="flex"
          >
            <Sidebar className="flex-1" />
          </Panel>

          {/* 调整手柄 */}
          <PanelResizeHandle className="w-1 bg-dark-border hover:bg-accent-primary transition-colors cursor-col-resize" />

          {/* 主内容区 */}
          <Panel minSize={40} className="flex">
            <MainContent className="flex-1" />
          </Panel>
        </PanelGroup>
      </div>

      {/* 状态栏 */}
      <StatusBar />
    </div>
  )
}

export default App
