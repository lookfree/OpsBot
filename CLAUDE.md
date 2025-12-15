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
