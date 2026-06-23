# ZWD-OpsBot

<div align="center">

![Version](https://img.shields.io/badge/version-0.1.5-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

一个功能强大的跨平台运维终端工具，整合了 SSH 终端、数据库客户端、中间件管理、Docker 管理和 AI 模型管理等功能。

[功能特性](#功能特性) • [技术栈](#技术栈) • [快速开始](#快速开始) • [开发指南](#开发指南)

</div>

## 📸 产品截图

<div align="center">

### SSH 终端界面
![SSH Terminal](./screenshots/ssh-terminal.png)

*支持多会话管理、快捷键操作、终端日志记录等功能*

---

### 数据库管理界面
![Database Management](./screenshots/database-management.png)

*可视化表结构设计、ER 图设计器、SQL 编辑器、查询结果展示*

---

### 中间件管理界面
![Middleware Management](./screenshots/middleware-management.png)

*Redis、Kafka、Elasticsearch 统一管理*

---

### Docker 管理界面
![Docker Management](./screenshots/docker-overview.png)

*容器监控、日志查看、交互式终端、镜像/网络/存储卷管理*

---

### SFTP 文件管理界面
![SFTP Management](./screenshots/sftp-management.png)

*文件浏览、拖拽上传下载、目录操作*

---

### AI 模型管理界面
![AI Management](./screenshots/ai-management.png)

*Ollama/TensorRT 本地模型管理、Cloud API 接入、GPU 监控、MCP 服务管理*

</div>

---

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [项目结构](#项目结构)
- [配置说明](#配置说明)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## ✨ 功能特性

### 🖥️ SSH 终端
- ✅ 支持密码和密钥认证
- ✅ 跳板机支持
- ✅ 多会话管理
- ✅ 终端日志记录
- ✅ 快捷键支持 (Ctrl+C 复制, Ctrl+V 粘贴)
- ✅ 右键菜单快捷操作
- ✅ 自定义字体大小
- ✅ 主题切换 (亮色/暗色)
- ✅ SSH 主机指纹验证与记录

### 📊 数据库管理
支持多种数据库：
- MySQL / MariaDB（含 MySQL 5.6 及以下兼容模式）
- PostgreSQL
- SQLite
- SQL Server
- ClickHouse
- Oracle
- 达梦 (DM)
- KingBase (人大金仓)

功能包括：
- 可视化表结构设计器（字段、索引、外键、触发器、CHECK 约束）
- ER 图设计器（可视化表关系、拖拽编辑）
- SQL 编辑器（语法高亮）
- 查询结果展示与导出
- 表数据的增删改查
- 视图、函数、存储过程管理

### 📦 中间件管理
- **Redis**: 键值管理、命令执行、数据编辑、监控、收藏命令、导出
- **Kafka**: 主题管理、消费者组、消息生产/消费
- **Elasticsearch**: 索引管理、文档查询、集群概览

### 🐳 Docker 管理
- 本地 / 远程 Docker 连接
- 容器列表与状态监控、资源统计 (Stats)
- 容器日志查看
- 交互式终端 (exec)
- Docker Compose 支持（编辑、启停）
- 镜像管理
- 网络管理
- 存储卷管理
- 镜像仓库管理

### 🤖 AI 模型管理
- **Ollama**: 本地模型列表、拉取/删除、连接管理
- **TensorRT-LLM**: 高性能推理引擎部署与连接管理
- **Cloud API**: OpenAI、Claude、通义千问接入配置
- **GPU 监控**: NVIDIA GPU 实时/历史负载、显存、进程监控
- **MCP 服务**: MCP Server 管理与工具列表
- **OpenWebUI**: 一键跳转 OpenWebUI 界面

### 📁 SFTP 文件管理
- 文件浏览与传输
- 拖拽上传/下载
- 文件在线编辑
- 文件重命名、删除
- 传输队列管理

### ⚙️ 其他
- 连接配置导入/导出（备份与迁移）
- 密钥串加密存储敏感信息
- 国际化（简体中文、繁体中文、English、日本語）

## 🛠️ 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **桌面端**: Tauri v2
- **UI 组件**: Radix UI
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **终端**: xterm.js
- **代码编辑器**: Monaco Editor
- **国际化**: i18next

### 后端
- **语言**: Rust
- **SSH**: russh
- **数据库驱动**: sqlx、tokio-postgres、mysql_async、clickhouse-rs
- **Docker**: bollard
- **异步运行时**: tokio
- **序列化**: serde
- **加密**: 系统 Keyring + 自定义加密服务

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- npm 或 pnpm

### 安装依赖

```bash
# 安装前端依赖
npm install

# 后端依赖会在编译时自动安装
```

### 开发模式

```bash
# 启动开发服务器 (前端 + 后端)
npm run tauri dev
```

### 构建发布版本

```bash
# 构建生产版本
npm run tauri build
```

构建产物位于 `backend/target/release/bundle/`

## 📖 开发指南

### 代码规范

- 每个函数不超过 80 行
- 单个代码文件不超过 800 行，超过需拆分
- 使用策略模式解耦多数据库/中间件实现，便于扩展
- 遵循 TypeScript/Rust 最佳实践
- Git 提交遵循 Conventional Commits（`feat:`, `fix:`, `chore:`, `refactor:` 等），使用英文

### 项目结构

```
ZWD-OpsBot/
├── front/                     # 前端代码
│   ├── components/
│   │   ├── ai/                # AI 模型管理（Ollama/TensorRT/CloudAPI/GPU/MCP）
│   │   ├── database/          # 数据库管理（含 ER 图设计器、表结构编辑器）
│   │   ├── docker/            # Docker 管理（容器/镜像/网络/存储卷/仓库）
│   │   ├── kafka/             # Kafka 管理
│   │   ├── middleware/        # Redis / Elasticsearch 管理
│   │   ├── sftp/              # SFTP 文件管理
│   │   ├── ssh/               # SSH 连接
│   │   ├── terminal/          # 终端组件
│   │   ├── settings/          # 设置（导入/导出）
│   │   ├── layout/            # 布局（侧边栏、标签栏、连接树）
│   │   └── common/            # 通用组件
│   ├── stores/                # Zustand 状态管理
│   ├── services/              # API 服务层
│   ├── i18n/                  # 国际化翻译 (zh-CN/zh-TW/en-US/ja-JP)
│   └── styles/                # 样式文件
├── backend/                   # 后端代码 (Rust)
│   ├── src/
│   │   ├── commands/          # Tauri 命令（ai/database/docker/middleware/sftp/ssh）
│   │   ├── services/
│   │   │   ├── ai/            # AI 服务（ollama/tensorrt/cloud_api/gpu/mcp）
│   │   │   ├── database/      # 数据库驱动（mysql/pg/sqlite/clickhouse/oracle/dm/kingbase…）
│   │   │   ├── docker/        # Docker 服务（本地/远程）
│   │   │   ├── middleware/    # 中间件服务（redis/kafka/elasticsearch）
│   │   │   ├── crypto_service.rs
│   │   │   ├── keyring_service.rs
│   │   │   ├── known_hosts.rs
│   │   │   ├── sftp_service.rs
│   │   │   └── ssh_service.rs
│   │   └── models/            # 数据模型
│   ├── tauri.conf.json
│   └── Cargo.toml
├── spec/                      # 设计文档
└── CLAUDE.md                  # AI 辅助开发指南
```

### 调试说明

本项目是 Tauri 桌面应用，调试时：
- 运行 `npm run tauri dev` 启动开发服务器
- 查看后端日志输出定位问题
- 前端可使用 WebView 内置开发者工具
- **注意**：不要同时运行 `tauri dev` 实例和已安装的 `.app`，两者使用不同的 WebView storage，连接配置互不共享

### 添加新功能

1. 在 `spec/` 目录查看或创建功能设计文档
2. 实现功能代码
3. 添加国际化翻译（4 种语言，使用 `.json` 文件）
4. 完成后更新 spec 文档的验收标准（`[ ]` → `[x]`）

### 国际化

翻译文件位于 `front/i18n/locales/`，支持：
- 简体中文 (`zh-CN.json`)
- 繁体中文 (`zh-TW.json`)
- 英文 (`en-US.json`)
- 日文 (`ja-JP.json`)

## 🎨 配置说明

### Tauri 配置

主要配置位于 `backend/tauri.conf.json`：
- 窗口大小和行为
- 应用权限
- 构建选项
- 图标资源

### 数据存储

- 连接配置：本地 SQLite（`test.db`）
- 敏感信息（密码、密钥）：系统 Keyring 加密存储
- 连接配置支持导出/导入，方便跨设备迁移

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add some amazing feature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📝 许可证

本项目采用 Apache License 2.0 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [xterm.js](https://xtermjs.org/) - 终端模拟器
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器
- [Radix UI](https://www.radix-ui.com/) - UI 组件库
- [russh](https://github.com/warp-tech/russh) - Rust SSH 库
- [bollard](https://github.com/fussybeaver/bollard) - Rust Docker 客户端

---

<div align="center">

Made with ❤️ by ZWD Team

</div>
