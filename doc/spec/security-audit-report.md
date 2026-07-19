# ZWD-OpsBot Security Audit Report

> **Date**: 2026-02-11
> **Reviewers**: auth-reviewer, dep-auditor, injection-checker, perf-analyzer, arch-evaluator
> **Scope**: Full project security review covering authentication, dependencies, injection risks, performance, and architecture

---

## Audit Overview

| Dimension | Reviewer | High | Medium | Low | Status |
|-----------|----------|------|--------|-----|--------|
| Authentication & Authorization | auth-reviewer | 5 | 6 | 3 | Done |
| Dependency Vulnerabilities | dep-auditor | 1 | 3 | 20 (warnings) | Done |
| Input Validation & Injection | injection-checker | 7 | 4 | 3 | Done |
| Performance & Resource Mgmt | perf-analyzer | 5 | 5 | 4 | Done |
| Architecture Extensibility | arch-evaluator | 4 | 3 | 4 | Done |

**Total: 22 High, 21 Medium, 34 Low/Info**

---

## P0 -- Must Fix Immediately (High Severity)

### 1. Storage Encryption Is Effectively Obfuscation (auth + injection cross-confirmed)

- `crypto_service.rs:21` -- Hardcoded key (`STORAGE_KEY_PASSPHRASE`) + fixed salt
- `secureStorage.ts:82` -- Silent fallback to plaintext localStorage on encryption failure
- `configExport.ts:154` -- Config export uses the same hardcoded key
- **Fix**: Migrate to OS-native keychain (macOS Keychain / Windows Credential Manager) or `tauri-plugin-stronghold`; remove plaintext fallback logic

### 2. SSH Host Key Verification Completely Missing (auth + injection cross-confirmed)

- `ssh_service.rs:87-93` -- `check_server_key` always returns `Ok(true)`
- `ssh_service.rs:444` -- Jump host connection uses `StrictHostKeyChecking=no`
- **Fix**: Implement TOFU (Trust On First Use) model with known_hosts management

### 3. OS Command Injection -- Docker Search (injection)

- `docker/local.rs:~1372` -- Uses `sh -c` + `format!` to build search command
- **Fix**: Replace with `Command::new("docker").args([...])` parameter array

### 4. OS Command Injection -- Jump Host SSH (auth + injection cross-confirmed)

- `ssh_service.rs:443-447` -- username/host directly concatenated into shell command
- **Fix**: Strict input validation + shell escaping, or switch to native port forwarding

### 5. SQL Injection -- DDL Operations (injection)

- MySQL (`mysql.rs:224,268,397,411,423`) and PostgreSQL (`postgresql.rs:483,521,533`) DDL operations use `format!` to build identifiers
- **Fix**: Identifier whitelist `^[a-zA-Z0-9_]+$` or proper escaping (double backticks / double quotes)

### 6. Arbitrary File Write (injection)

- `commands/utils.rs` -- `append_to_file` has no path validation
- **Fix**: Restrict write directory to app data directory, reject `..` path components

### 7. Unbounded Memory Consumption (performance, can cause DoS)

- `ssh_service.rs:617-631` -- SSH command output has no size limit
- `sftp_service.rs:203-216` -- SFTP download loads entire file into memory
- All database drivers use `fetch_all()` with no row limit
- **Fix**: Add output size cap (10MB), streaming download, query row limit (10,000)

### 8. Rust Dependency Vulnerabilities -- Immediate Fix Available (dependencies)

- `bytes` 1.11.0 integer overflow -> `cargo update -p bytes`
- `time` 0.3.44 stack exhaustion DoS -> `cargo update -p time`
- `rkyv` 0.7.45 UB -> `cargo update -p rkyv`

---

## P1 -- Fix Soon (Medium-High Severity)

### Security Boundaries

| Issue | Location | Fix |
|-------|----------|-----|
| CSP disabled | `tauri.conf.json:27` | Set strict CSP policy |
| Filesystem permissions `**` wildcard | `capabilities/default.json:24,35` | Restrict to necessary directories |
| IPC commands have no permission tiers | `lib.rs:48-361` | Use Tauri v2 capability system |
| MCP Server arbitrary command execution | `services/ai/mcp/server.rs:53-60` | Implement command whitelist |

### Resource Management

| Issue | Location | Fix |
|-------|----------|-----|
| MSSQL single-connection bottleneck | `database/mssql.rs:26-28` | Use connection pool |
| Redis unnecessary Mutex | `middleware/redis/driver.rs:28-30` | Remove Mutex, clone MultiplexedConnection |
| SSH sessions no auto-cleanup | `ssh_service.rs:128-147` | Implement heartbeat + stale session cleanup |
| Docker operations no timeout | `services/docker/mod.rs` | Add `tokio::time::timeout()` wrappers |

### Dependencies

| Issue | Fix |
|-------|-----|
| rsa Marvin Attack (CVSS 5.9) -- no fix version | Prefer Ed25519 keys over RSA |
| elasticsearch 8.5.0-alpha.1 | Evaluate stable alternatives or use raw reqwest |

### Data Security

| Issue | Fix |
|-------|-----|
| Credentials stored in frontend localStorage | Migrate sensitive storage to Rust backend |
| AI API Key passed as plaintext via IPC | Store in backend, reference by ID from frontend |

---

## P2 -- Planned Fix

### Injection Protection

| Issue | Source |
|-------|--------|
| Ollama command args shell metacharacter filtering | injection-checker |
| SFTP path validation + file size/type limits | injection-checker |
| Dangerous SQL/Redis commands need confirmation | injection-checker |
| Operation audit logging | injection-checker |

### Performance & Resources

| Issue | Source |
|-------|--------|
| `tokio::spawn` tasks not tracked or cancellable | perf-analyzer |
| Jump host connection resource leak | perf-analyzer |
| `parking_lot::RwLock` -> `tokio::sync::RwLock` | perf-analyzer |
| SFTP transfer metadata never auto-cleaned | perf-analyzer |
| Frontend `getTreeNodes()` recomputes on every call | perf-analyzer |

### Architecture

| Issue | Source |
|-------|--------|
| 13 files exceed 800-line limit (docker/remote.rs: 1615 lines) | arch-evaluator |
| 3 functions exceed 80-line limit | arch-evaluator |
| Test coverage near zero (4 backend test modules, 0 frontend tests) | arch-evaluator |
| Release builds have no logging infrastructure | arch-evaluator |
| `Result<T, String>` should be replaced with typed error enums | arch-evaluator |

### Dependencies & Maintenance

| Issue | Source |
|-------|--------|
| Redis TLS disabled | dep-auditor |
| Simplify tokio features, eliminate duplicate version dependencies | dep-auditor |
| Remove legacy `.ts` i18n files (en-US.ts, zh-CN.ts) | arch-evaluator |

---

## Positive Findings

- Strategy pattern correctly and consistently used across all backend modules (Database, Docker, Middleware, AI)
- Feature flags well-designed for optional dependency gating
- Docker Compose module has good input validation (whitelist + path normalization)
- Database metadata queries correctly use parameterized bindings
- npm dependencies: 0 known vulnerabilities across 379 packages
- Frontend Zustand store architecture is clean; AI store slice pattern scales well
- Release profile is secure (strip/LTO/panic=abort)
- Config encryption uses AES-256-GCM + PBKDF2 (correct algorithm choice; issue is key management)
- Cargo feature flags allow per-platform dependency trimming (Oracle, DM, Kafka are opt-in)

---

## Files Exceeding 800-Line Limit

| File | Lines | Over By | Priority |
|------|-------|---------|----------|
| `backend/src/services/docker/remote.rs` | 1615 | +815 | High |
| `backend/src/services/docker/local.rs` | 1556 | +756 | High |
| `front/components/middleware/MiddlewareConnectionDialog.tsx` | 1380 | +580 | High |
| `front/services/middleware.ts` | 1050 | +250 | High |
| `front/components/database/CreateTableInline.tsx` | 1047 | +247 | High |
| `front/components/docker/RegistryList.tsx` | 939 | +139 | Medium |
| `backend/src/commands/docker.rs` | 874 | +74 | Medium |
| `backend/src/services/ssh_service.rs` | 847 | +47 | Medium |
| `front/services/docker.ts` | 844 | +44 | Medium |
| `front/components/database/CreateTableDialog.tsx` | 835 | +35 | Low |
| `backend/src/commands/middleware.rs` | 829 | +29 | Low |
| `backend/src/services/database/mssql.rs` | 817 | +17 | Low |
| `front/components/database/EditTableStructureInline.tsx` | 803 | +3 | Low |

---

## Resource Management Assessment

| Module | Resource Type | Management | Rating |
|--------|-------------|------------|--------|
| SSH | TCP connections + channels | HashMap with manual insert/remove | FAIR |
| SFTP (browse) | SFTP sessions | HashMap tied to SSH lifecycle | GOOD |
| SFTP (transfer) | Dedicated sessions + semaphore | HashMap + Semaphore(2) | GOOD |
| Database (MySQL/PG/MariaDB) | Connection pool (sqlx) | Pool with max_connections=10 | GOOD |
| Database (MSSQL) | Single TCP connection | Arc\<Mutex\<Client\>\> | POOR |
| Database (Oracle/DM) | Connection pool (native) | Pool via C library + spawn_blocking | FAIR |
| Docker (local) | Bollard client | Shared client instance | GOOD |
| Docker (remote) | SSH exec commands | SshService shared reference | FAIR |
| Redis | Single multiplexed connection | Arc\<Mutex\<Connection\>\> | POOR |
| Kafka | rdkafka client | Arc in session map | GOOD |
| Elasticsearch | reqwest::Client | Shared client instance | GOOD |
| MCP Server | Child processes | HashMap + Drop impl | GOOD |

---

## Recommended Fix Roadmap

```
Phase 1 (This week)   -> P0 all 8 items: cargo update 3 deps + hardcoded key +
                          command injection + SQL injection + file write + memory limits
Phase 2 (1-2 weeks)   -> P1 security boundaries: CSP + FS permissions + IPC tiers +
                          MCP whitelist
Phase 3 (2-4 weeks)   -> P1 resource management: connection pools + session cleanup +
                          timeouts + credential migration to backend
Phase 4 (1-3 months)  -> P2 all: injection hardening + architecture compliance +
                          test infrastructure + logging infrastructure
```

---

## Rust Dependency Vulnerability Details

### Confirmed Vulnerabilities

| Crate | Version | ID | Severity | Description | Fix |
|-------|---------|-----|----------|-------------|-----|
| bytes | 1.11.0 | RUSTSEC-2026-0007 | High | `BytesMut::reserve` integer overflow | >= 1.11.1 |
| rsa | 0.9.9 | RUSTSEC-2023-0071 | Medium (CVSS 5.9) | Marvin Attack timing side-channel | No fix available |
| time | 0.3.44 | RUSTSEC-2026-0009 | Medium (CVSS 6.8) | Stack exhaustion DoS | >= 0.3.47 |
| rkyv | 0.7.45 | RUSTSEC-2026-0001 | Medium | UB in `Arc<T>`/`Rc<T>` from_value on OOM | >= 0.7.46 |

### Duplicate Version Dependencies (Increased Attack Surface)

| Crate | Versions | Source |
|-------|----------|--------|
| reqwest | 0.11.27 + 0.12.25 | elasticsearch pulls old version |
| hyper | 0.14.32 + 1.8.1 | Same cause |
| h2 | 0.3.27 + 0.4.12 | Same cause |
| http | 0.2.12 + 1.4.0 | Same cause |
| tokio-rustls | 0.24.1 + 0.26.4 | Same cause |

---

## Tauri Commands Validation Status

| Command | File | Validation | Risk |
|---------|------|------------|------|
| `append_to_file` | commands/utils.rs | None | **High** |
| `db_execute_sql` | commands/database.rs | No restriction | Medium |
| `db_get_table_structure` | commands/database.rs | No identifier validation | High (service layer) |
| `db_get_table_ddl` | commands/database.rs | No identifier validation | High (service layer) |
| `db_rename_table` | commands/database.rs | No identifier validation | High (service layer) |
| `db_drop_table` | commands/database.rs | No identifier validation | High (service layer) |
| `db_get_tables` | commands/database.rs | Parameterized query | Safe |
| `db_get_schemas` | commands/database.rs | Parameterized query | Safe |
| `db_connect` | commands/database.rs | Typed parameters | Safe |
| `ssh_exec_command` | commands/ssh.rs | None (by design) | Low |
| `ssh_connect` | commands/ssh.rs | No format validation | Medium |
| `sftp_download` | commands/sftp.rs | No path validation | Medium |
| `sftp_upload` | commands/sftp.rs | No size/type limits | Medium |
| `sftp_write_file` | commands/sftp.rs | No path validation | Medium |
| `docker_search_images` | commands/docker.rs | No input validation | **High** |
| `docker_compose_*` | commands/docker.rs | Has validation | Safe |
| `mw_redis_execute_command` | commands/middleware.rs | No command restriction | Medium |
| `mw_redis_get/set/del` | commands/middleware.rs | Redis crate API | Safe |
| `mcp_start_server` | commands/ai.rs | No command restriction | High |
| `remote_ai_*` | commands/ai.rs | Partial validation | Medium |
| `encrypt_*` / `decrypt_*` | commands/crypto.rs | Typed parameters | Safe |
