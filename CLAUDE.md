# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZWD-OpsBot is a cross-platform operations terminal tool targeting developers, testers, and DevOps engineers. It consolidates SSH terminals, database clients, middleware management, and Docker management into a single application.

**Status**: Planning/Design phase - see `zwd-opsbot功能需求.md` for detailed requirements.

## Core Design Principle

**"Offline First, AI Enhanced"**
- All core features must work completely offline without any LLM dependency
- AI capabilities are optional enhancements, not requirements
- When AI is unavailable, the tool gracefully degrades to manual mode with template libraries and visual editors

## Planned Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Tauri + React + TypeScript |
| Backend | Rust |
| AI (Optional) | OpenAI API / Claude API / Ollama (local) |

## Target Platforms

- Windows (x64)
- macOS (Intel & Apple Silicon)
- Linux (x64)

## Project Structure

```
ZWD-OpsBot/
├── front/              # Frontend (React + TypeScript)
│   ├── components/     # React components
│   ├── stores/         # Zustand state management
│   ├── i18n/           # Internationalization
│   └── styles/         # CSS/Tailwind styles
├── backend/            # Backend (Rust/Tauri)
│   ├── src/
│   │   ├── commands/   # Tauri commands
│   │   ├── services/   # Business logic
│   │   └── models/     # Data models
│   └── Cargo.toml
├── spec/               # Design specifications
└── dist/               # Build output
```

## Architecture

```
Frontend (React + Tauri) - front/
├── Terminal Management Panel
├── Deployment/Ops Panel
└── AI Assistant (Optional)

Backend (Rust/Tauri) - backend/
├── Connection Manager (SSH/DB/Middleware)
├── Task Execution Engine (Scripts/Workflows)
└── AI Engine (Optional Module)
```

## Key Modules

1. **SSH Module**: Terminal, RDP, jump hosts, batch execution
2. **Database Module**: MySQL, MariaDB, PostgreSQL, SQLite with SQL editor
3. **SFTP Module**: File transfer with drag-drop support
4. **Docker Module**: Container/image management, compose editing
5. **Middleware Module**: Redis, Kafka, Elasticsearch, ClickHouse management
6. **Deployment Module**: Automated middleware deployment (containerized & non-containerized)

## Plugin System

Database and middleware drivers use a plugin architecture. Drivers are auto-downloaded on first connection from the ZWD-OpsBot resource site. Reference DBeaver's implementation for the download/fallback pattern.

## Resource Site

The project has an official resource site (`resources.zwd-opsbot.com`) maintained by the team that provides:
- Verified middleware installation packages
- Pre-configured Docker images
- Checksum files (MD5/SHA256)

## 开发规范
每个函数不超过80行
单个代码文件不超过800行，超过就要拆分
使用策略模式解偶多数据库的实现，方便扩展和维护（前端和后端）

## 调试说明
- 本项目是 Tauri 桌面应用，调试时在桌面端进行，不要使用 Chrome MCP 工具
- 运行 `npm run tauri dev` 启动开发服务器
- 查看后端日志输出定位问题

## 本次 MySQL 表树问题复盘

### 问题现象
- MySQL 连接能成功展开数据库。
- 库节点下面能看到表的统计数量，或者能看到视图/函数分类。
- 但实际表节点不显示。
- PostgreSQL 正常显示，因为 PostgreSQL 走的是 `database -> schema -> tables` 路径，和 MySQL 树路径不同。

### 根因
1. MySQL 树加载依赖 `SHOW DATABASES` 和 `information_schema.TABLES`，在某些连接配置、默认库、权限或老 MySQL 场景下，`SHOW DATABASES` 可能返回空，或者查库列表和查表路径不一致。
2. MySQL 表节点原来主要依赖前端分类节点展开状态，后端能查到表数量时，前端仍可能没有把实际表节点展开出来。
3. 调试过程中混用了两种桌面端：
   - `npm run tauri -- dev` 启动的是开发实例，前端 origin 是 `http://localhost:1420`。
   - `/Applications/ZWD-OpsBot.app` 是已安装实例，使用另一个 WebView storage/origin。
   - 两者的 `localStorage` 连接配置不是同一份，所以会出现同一个 IP 下连接名、默认库、连接 ID 不一致的情况。这个会误导排查。

### 修复点
- 后端 `DatabaseService::get_databases` 对 MySQL/MariaDB 增加默认库兜底：如果连接配置里有默认库，即使 `SHOW DATABASES` 返回空，也把默认库补进树。
- MySQL 驱动查表增加降级逻辑：
  - 优先查 `information_schema.TABLES`。
  - 如果为空，降级执行 `SHOW FULL TABLES FROM \`database\``。
- 老 MySQL 驱动 `mysql_legacy` 同步支持上述查表降级，兼容 MySQL 5.6 及以下场景。
- 前端 MySQL/MariaDB 库节点展开后固定生成 `表(count)` 分类，并自动展开表分类下面的表节点。
- 表、视图、函数、过程节点携带明确的 `dbName/schemaName`，避免只靠拆分节点 ID 推断数据库名。
- 增加链路日志：
  - `[DB_CMD]`：Tauri command 入口参数和返回数量。
  - `[DB_TREE]`：统一数据库服务层连接、库列表、表列表。
  - `[MySQL]` / `[MySQL5.6]`：驱动层 SQL 路径、返回行数、表名 sample。

### 正确验证方式
- 不要同时打开 `tauri dev` 和 `/Applications/ZWD-OpsBot.app` 验证同一个问题。
- 如果要验证开发实例，统一使用 `npm run tauri -- dev`，并接受它读取的是开发实例自己的 WebView storage。
- 如果要验证用户真实连接配置，先构建最新 app，再覆盖 `/Applications/ZWD-OpsBot.app`，只启动这一份：
  1. `npm run tauri -- build --debug`
  2. 使用生成的 `backend/target/debug/bundle/macos/ZWD-OpsBot.app`
  3. 覆盖 `/Applications/ZWD-OpsBot.app`
  4. 只启动 `/Applications/ZWD-OpsBot.app`
- 验证前用进程列表确认只有一个实例：
  - 不能同时存在 `target/debug/zwd-opsbot` 和 `/Applications/ZWD-OpsBot.app/Contents/MacOS/zwd-opsbot`。
- 判断问题时以日志链路为准：
  - 如果 `[DB_CMD] db_get_tables` 返回 `count > 0`，说明后端查表已通。
  - 如果 UI 仍不显示表，继续查前端树节点渲染/展开状态。
  - 如果 `[DB_CMD]` 没出现，只看到驱动连接日志，说明当前操作可能不是走数据库树加载路径，或者点到的不是当前构建实例。

## 国际化 (i18n)
- 翻译文件位于 `front/i18n/locales/` 目录
- **重要**: i18n 使用 `.json` 文件，不是 `.ts` 文件！
- 支持的语言: zh-CN.json, zh-TW.json, en-US.json, ja-JP.json
- 添加新翻译时，需同时更新所有语言的 `.json` 文件
- i18n 配置在 `front/i18n/index.ts` 中加载 JSON 文件

## Git 提交规范
- 提交信息格式遵循 Conventional Commits（如 `feat:`, `fix:`, `chore:`, `refactor:` 等）
- 提交信息用英文撰写，简洁描述变更目的
- 提交账号: lookfree <etwuman@126.com>
- **禁止**在提交信息中包含任何 Claude 相关内容（不添加 `Co-Authored-By: Claude...`）

## 文档管理
- 设计文档位于 `spec/` 目录
- 完成功能后更新对应 spec 文档的验收标准状态（将 `[ ]` 改为 `[x]`）
