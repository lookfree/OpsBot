# ZWD-OpsBot AI 模块需求分析与设计文档

## 一、需求概述

### 1.1 参考系统
参考 1Panel 面板的 AI 模块设计（https://demo.1panel.cn/ai/）

### 1.2 功能范围
根据用户需求确认，AI 模块需要支持：
- **使用场景**：本地 + 远程服务器 AI 服务管理
- **AI 引擎**：Ollama、TensorRT LLM、云端 API（OpenAI/Claude）
- **GPU 监控**：完整功能（实时监控 + 历史记录）
- **MCP**：需要支持

---

## 二、功能模块设计

### 2.1 模块结构

```
AI 模块
├── 模型管理 (Model)
│   ├── Ollama 引擎
│   ├── TensorRT LLM 引擎
│   └── 云端 API（OpenAI/Claude/通义千问）
├── MCP 管理 (Model Context Protocol)
│   ├── MCP Server 管理
│   └── 工具绑定
└── GPU 监控 (GPU Monitor)
    ├── 实时监控
    └── 历史记录
```

### 2.2 详细功能清单

#### 2.2.1 模型管理 - Ollama

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 连接管理 | 支持连接本地/远程 Ollama 服务 | P0 |
| 服务状态 | 显示 Ollama 版本、运行状态 | P0 |
| 服务控制 | 启动/停止/重启 Ollama 服务 | P0 |
| 模型列表 | 显示已安装模型（名称、大小、状态、时间） | P0 |
| 添加模型 | 从 Ollama 库下载模型 | P0 |
| 删除模型 | 删除已安装模型 | P0 |
| 运行模型 | 加载/卸载模型到内存 | P1 |
| 连接信息 | 显示 API 端点地址和端口 | P1 |
| 日志查看 | 查看模型运行日志 | P1 |
| 从服务器同步 | 同步远程服务器模型列表 | P2 |
| OpenWebUI 集成 | 快速打开 OpenWebUI 界面 | P2 |

#### 2.2.2 模型管理 - TensorRT LLM

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 连接管理 | 支持连接本地/远程 TensorRT 服务 | P1 |
| 模型列表 | 显示模型（名称、版本、端口、状态） | P1 |
| 创建模型 | 创建新的 TensorRT 模型实例 | P1 |
| 服务控制 | 启动/停止模型服务 | P1 |
| 日志查看 | 查看运行日志 | P2 |

#### 2.2.3 模型管理 - 云端 API

| 功能 | 描述 | 优先级 |
|------|------|--------|
| API 配置 | 配置 API Key、Base URL | P0 |
| 提供商管理 | 支持 OpenAI、Claude、通义千问等 | P0 |
| 模型选择 | 选择可用模型（gpt-4、claude-3等） | P0 |
| 连接测试 | 测试 API 连接是否正常 | P0 |
| 代理设置 | 支持 HTTP/SOCKS 代理 | P1 |

#### 2.2.4 MCP 管理

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Server 列表 | 显示 MCP Server（名称、地址、状态） | P1 |
| 创建 Server | 创建新的 MCP Server | P1 |
| 删除 Server | 删除 MCP Server | P1 |
| 工具绑定 | 将 MCP Server 绑定到工具/服务 | P2 |
| 状态监控 | 监控 Server 运行状态 | P2 |

#### 2.2.5 GPU 监控

| 功能 | 描述 | 优先级 |
|------|------|--------|
| GPU 检测 | 检测本地/远程 NVIDIA GPU | P0 |
| 实时监控 | 显示 GPU 使用率、显存、温度、功耗 | P0 |
| 历史记录 | 记录并展示 GPU 使用历史图表 | P1 |
| 多 GPU 支持 | 支持监控多块 GPU | P1 |
| 进程列表 | 显示占用 GPU 的进程 | P2 |

---

## 三、技术架构设计

### 3.1 前端架构

```
front/components/ai/
├── AiConnectionDialog.tsx        # AI 服务连接对话框
├── AiContainer.tsx               # AI 模块主容器
├── model/                        # 模型管理组件
│   ├── OllamaPanel.tsx          # Ollama 面板
│   ├── OllamaModelList.tsx      # Ollama 模型列表
│   ├── AddModelDialog.tsx       # 添加模型对话框
│   ├── TensorRTPanel.tsx        # TensorRT 面板
│   ├── CloudApiPanel.tsx        # 云端 API 面板
│   └── ApiConfigDialog.tsx      # API 配置对话框
├── mcp/                          # MCP 管理组件
│   ├── McpServerList.tsx        # MCP Server 列表
│   ├── CreateServerDialog.tsx   # 创建 Server 对话框
│   └── ToolBindingPanel.tsx     # 工具绑定面板
└── gpu/                          # GPU 监控组件
    ├── GpuMonitorPanel.tsx      # GPU 监控主面板
    ├── GpuRealtimeChart.tsx     # 实时监控图表
    ├── GpuHistoryChart.tsx      # 历史记录图表
    └── GpuProcessList.tsx       # GPU 进程列表
```

### 3.2 后端架构

```
backend/src/services/ai/
├── mod.rs                        # AI 服务模块入口
├── traits.rs                     # AI Driver 特征定义
├── ollama/                       # Ollama 驱动
│   ├── mod.rs
│   ├── driver.rs                # Ollama API 调用
│   ├── models.rs                # 模型管理
│   └── service.rs               # 服务控制
├── tensorrt/                     # TensorRT 驱动
│   ├── mod.rs
│   └── driver.rs
├── cloud_api/                    # 云端 API 驱动
│   ├── mod.rs
│   ├── openai.rs               # OpenAI 驱动
│   ├── claude.rs               # Claude 驱动
│   └── qwen.rs                 # 通义千问驱动
├── mcp/                          # MCP 服务
│   ├── mod.rs
│   └── server.rs
└── gpu/                          # GPU 监控服务
    ├── mod.rs
    ├── nvidia.rs               # NVIDIA GPU 监控（nvidia-smi）
    └── history.rs              # 历史记录存储

backend/src/commands/ai.rs        # Tauri 命令
backend/src/models/ai.rs          # 数据模型
```

### 3.3 数据模型设计

```typescript
// 前端类型定义 - front/types/ai.ts

// AI 连接类型
interface AiConnection {
  id: string
  name: string
  type: 'ollama' | 'tensorrt' | 'openai' | 'claude' | 'qwen'
  host?: string          // 本地/远程地址
  port?: number          // 端口
  apiKey?: string        // 云端 API Key（加密存储）
  baseUrl?: string       // 自定义 API Base URL
  proxy?: ProxyConfig    // 代理配置
  sshConnectionId?: string // 关联的 SSH 连接（远程管理）
}

// Ollama 模型
interface OllamaModel {
  name: string
  size: number
  digest: string
  modifiedAt: string
  status: 'idle' | 'running' | 'downloading'
}

// GPU 信息
interface GpuInfo {
  index: number
  name: string
  uuid: string                // GPU UUID
  driverVersion: string       // 驱动版本
  cudaVersion: string         // CUDA 版本
  architecture: string        // 架构 (Ampere/Hopper/Ada Lovelace)
  computeCapability: string   // 计算能力 (8.0/9.0 等)
  memoryTotal: number         // 显存总量 (MB)
  memoryUsed: number          // 已用显存 (MB)
  memoryFree: number          // 剩余显存 (MB)
  utilization: number         // GPU 使用率 (%)
  memoryUtilization: number   // 显存使用率 (%)
  temperature: number         // 温度 (°C)
  powerDraw: number           // 当前功耗 (W)
  powerLimit: number          // 功耗上限 (W)
  fanSpeed: number            // 风扇转速 (%)
  cudaCores: number           // CUDA 核心数
  tensorCores: number         // Tensor 核心数
  smCount: number             // SM 数量
}

// GPU 历史记录
interface GpuHistory {
  timestamp: number
  gpuIndex: number
  utilization: number
  memoryUsed: number
  temperature: number
}

// MCP Server
interface McpServer {
  id: string
  name: string
  address: string
  port: number
  status: 'running' | 'stopped' | 'error'
  createdAt: string
}
```

### 3.4 GPU 技术背景

#### 3.4.1 GPU 与显卡概念

- **GPU (图形处理单元)**：计算机内部的硬件组件，专为并行计算设计
  - 处理图形渲染（游戏、视频、动画）
  - 加速通用计算（深度学习、科学模拟）
  - 高度并行处理，适用于大规模数据处理

- **显卡**：包含 GPU 芯片的完整硬件设备
  - 主要厂商：NVIDIA (N卡)、AMD (A卡)
  - 通过 PCIe 接口连接主板
  - 提供 HDMI、DisplayPort 等图形输出接口

#### 3.4.2 CUDA Core vs Tensor Core

| 类型 | 说明 | 用途 |
|------|------|------|
| CUDA Core | 基础运算单元，执行 FP32 浮点运算 | 通用并行计算、图形渲染 |
| Tensor Core | 专用矩阵运算单元（自 Volta 架构引入） | 机器学习、神经网络训练/推理 |

- Tensor Core 可将整个矩阵载入寄存器批量运算，效率提升 10+ 倍
- 自 Volta 架构以来，奠定了 NVIDIA 在 AI/ML 领域的领先地位

#### 3.4.3 SM (流式多处理器)

SM (Streaming Multiprocessor) 是 NVIDIA GPU 架构的核心组件：
- 每个 SM 包含多个 CUDA Core 和 Tensor Core
- 负责并行执行大量线程
- SM 数量直接影响 GPU 并行处理能力

#### 3.4.4 NVIDIA 架构演进

| 计算能力 | 架构 | 发布年代 | Cores/SM | 总 SM 数 | CUDA Cores | Tensor Cores | L1 Cache | L2 Cache |
|---------|------|---------|----------|----------|------------|--------------|----------|----------|
| 2.0 | Fermi | 2009 | 32 | 16 SM | 512 | - | 48 KB | 768 KB |
| 3.0 | Kepler | 2012 | 192 | 15 SMX | 2880 | - | 48 KB | 1536 KB |
| 5.0 | Maxwell | 2014 | 128 | 24 SMM | 3072 | - | 96 KB | 2048 KB |
| 6.0 | Pascal | 2016 | 64 | 60 SM | 3840 | - | 64 KB | 4096 KB |
| 7.0 | Volta | 2018 | 64 + 8TC | 80 SM | 5120 | 640 | 128 KB | 6144 KB |
| 7.5 | Turing | 2018 | 64 + 8TC | 72 SM | 4608 | 576 | 128 KB | 6144 KB |
| 8.0 | Ampere | 2020 | 64 + 4TC | 108 SM | 6912 | 432 | 192 KB | 40960 KB |
| 9.0 | Hopper | 2022 | 128 + 4TC | 144 SM | 18432 | 576 | 256 KB | 61440 KB |

*TC = Tensor Core*

#### 3.4.5 nvidia-smi 监控指标

通过 `nvidia-smi` 命令可获取以下监控数据：

```bash
# 基础信息查询
nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit --format=csv

# 进程信息查询
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```

| 指标 | nvidia-smi 参数 | 说明 |
|------|----------------|------|
| GPU 索引 | index | 多 GPU 环境中的序号 |
| GPU 名称 | name | 如 "NVIDIA RTX 4090" |
| UUID | uuid | GPU 唯一标识符 |
| 驱动版本 | driver_version | NVIDIA 驱动版本 |
| 显存总量 | memory.total | 总显存大小 (MiB) |
| 已用显存 | memory.used | 已使用显存 (MiB) |
| 剩余显存 | memory.free | 可用显存 (MiB) |
| GPU 使用率 | utilization.gpu | GPU 核心使用率 (%) |
| 显存使用率 | utilization.memory | 显存带宽使用率 (%) |
| 温度 | temperature.gpu | GPU 核心温度 (°C) |
| 当前功耗 | power.draw | 实时功耗 (W) |
| 功耗上限 | power.limit | 最大功耗限制 (W) |

### 3.5 侧边栏菜单扩展

在 `Sidebar.tsx` 中添加 AI 模块：

```typescript
const ModuleIcons = {
  ssh: Server,
  database: Database,
  docker: Container,
  middleware: Settings2,
  ai: Brain  // 新增 AI 模块图标
}

// 模块列表
const modules = ['ssh', 'database', 'docker', 'middleware', 'ai']
```

### 3.5 标签页类型扩展

```typescript
// front/types/tab.ts
type TabType = 'terminal' | 'sftp' | 'database' | 'docker' | 'middleware' | 'erDesigner' | 'ai'
```

---

## 四、UI/UX 设计

### 4.1 AI 模块主界面布局

```
┌─────────────────────────────────────────────────────────┐
│  [Ollama] [TensorRT LLM] [云端API]  ← 顶部标签切换      │
├─────────────────────────────────────────────────────────┤
│ ┌─ Ollama 面板 ─────────────────────────────────────┐   │
│ │ [Ollama] 已启动  版本: 0.5.11  [停止] [重启]      │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ [添加模型] [连接信息] [从服务器同步] [OpenWebUI]  │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ 模型        大小      状态    日志   时间    操作  │   │
│ │ ─────────────────────────────────────────────────  │   │
│ │ llama3:8b   4.7GB    成功    查看   12:30   运行  │   │
│ │ qwen:7b     4.1GB    成功    查看   11:20   运行  │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 GPU 监控界面

```
┌─────────────────────────────────────────────────────────┐
│  [实时监控] [历史记录]  ← 标签切换                       │
├─────────────────────────────────────────────────────────┤
│ ┌─ GPU 0: NVIDIA RTX 4090 ──────────────────────────┐   │
│ │  使用率: ████████░░░░░░░░ 52%                     │   │
│ │  显存:   ████████████░░░░ 16GB / 24GB            │   │
│ │  温度:   ████░░░░░░░░░░░░ 45°C                   │   │
│ │  功耗:   ██████░░░░░░░░░░ 180W / 450W            │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ 使用率趋势图 ────────────────────────────────────┐   │
│ │  100%│      ╭─╮                                   │   │
│ │   75%│   ╭─╯  ╰╮    ╭╮                           │   │
│ │   50%│ ╭╯      ╰───╯  ╰──                        │   │
│ │   25%│╯                                           │   │
│ │    0%└────────────────────────────────────────    │   │
│ │      12:00  12:05  12:10  12:15  12:20  12:25    │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 五、国际化 Key 设计

```json
{
  "ai": {
    "title": "AI",
    "model": {
      "title": "模型管理",
      "ollama": "Ollama",
      "tensorrt": "TensorRT LLM",
      "cloudApi": "云端 API",
      "addModel": "添加模型",
      "deleteModel": "删除模型",
      "runModel": "运行模型",
      "stopModel": "停止模型",
      "connectionInfo": "连接信息",
      "syncFromServer": "从服务器同步",
      "modelName": "模型名称",
      "modelSize": "大小",
      "status": "状态",
      "logs": "日志",
      "operations": "操作"
    },
    "mcp": {
      "title": "MCP",
      "createServer": "创建 Server",
      "deleteServer": "删除 Server",
      "bindTool": "绑定工具",
      "serverName": "名称",
      "address": "地址",
      "status": "状态"
    },
    "gpu": {
      "title": "GPU 监控",
      "realtime": "实时监控",
      "history": "历史记录",
      "utilization": "使用率",
      "memory": "显存",
      "temperature": "温度",
      "power": "功耗",
      "notDetected": "未检测到 NVIDIA GPU"
    },
    "cloudApi": {
      "provider": "服务商",
      "apiKey": "API Key",
      "baseUrl": "Base URL",
      "testConnection": "测试连接",
      "proxy": "代理设置"
    }
  }
}
```

---

## 六、实施计划

### Phase 1 - 基础框架（P0）
- [x] 创建 AI 模块前端组件结构
- [x] 创建后端服务框架（traits、mod）
- [x] 添加侧边栏菜单和标签页支持
- [x] 实现 Ollama 基础功能（连接、模型列表、添加/删除）
- [x] 添加国际化支持

### Phase 2 - GPU 监控（P0）
- [x] 实现 GPU 检测（nvidia-smi）
- [x] 实现实时监控面板
- [x] 实现历史记录存储和展示

### Phase 3 - 云端 API（P0）
- [x] 实现 API 配置界面
- [x] 实现 OpenAI/Claude/通义千问驱动
- [x] 实现连接测试功能

### Phase 4 - 高级功能（P1-P2）
- [ ] 实现 TensorRT LLM 支持
- [ ] 实现 MCP Server 管理
- [ ] 实现 OpenWebUI 集成
- [ ] 实现远程服务器管理（通过 SSH）

---

## 七、验证方案

1. **单元测试**: 为每个驱动编写单元测试
2. **集成测试**: 测试前后端通信
3. **手动验证**:
   - 启动 `npm run tauri dev`
   - 测试 Ollama 连接和模型管理
   - 测试 GPU 监控（需要 NVIDIA GPU 环境）
   - 测试云端 API 配置和连接

---

## 八、关键文件清单

| 类型 | 文件路径 |
|------|----------|
| 前端主容器 | `front/components/ai/AiContainer.tsx` |
| 连接对话框 | `front/components/ai/AiConnectionDialog.tsx` |
| Ollama 面板 | `front/components/ai/model/OllamaPanel.tsx` |
| GPU 监控面板 | `front/components/ai/gpu/GpuMonitorPanel.tsx` |
| 类型定义 | `front/types/ai.ts` |
| 国际化 | `front/i18n/locales/*.json` |
| 后端服务 | `backend/src/services/ai/mod.rs` |
| Tauri 命令 | `backend/src/commands/ai.rs` |
| 数据模型 | `backend/src/models/ai.rs` |
| 设计文档 | `spec/ai-module-spec.md` |
