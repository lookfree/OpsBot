# P1 Security Fixes Implementation Plan

## Status: Completed

## Context

P0 fixes are complete (8 categories: dependency updates, command injection, SQL injection, file write, memory limits, encryption fallback). The security audit identified 21 P1 (Medium-High) issues. This plan addresses the 6 most impactful and practical fixes. Data security (credential migration), IPC permission tiers, and MSSQL pooling are deferred to Phase 3 as they require major architectural changes.

---

## Fix 1: Enable CSP - [x] Done

**File**: `backend/tauri.conf.json:27`

Changed `"csp": null` to:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset: https:; connect-src 'self' https: wss:; font-src 'self' data:"
```

Rationale: `'unsafe-inline'` for styles needed for React/xterm.js; `connect-src https: wss:` for AI API + WebSocket; `img-src https:` for remote images.

---

## Fix 2: Remove filesystem `**` wildcard - [x] Done

**File**: `backend/capabilities/default.json:24,35`

Removed `{ "path": "**" }` from both `fs:allow-write-text-file` and `fs:allow-read-text-file` arrays. Added `{ "path": "$APPDATA/**" }` and `{ "path": "$APPLOCALDATA/**" }`. The existing `$HOME/**`, `$DOCUMENT/**`, `$DESKTOP/**`, `$DOWNLOAD/**`, `$TEMP/**` paths cover all legitimate app operations.

---

## Fix 3: MCP Server command whitelist - [x] Done

**File**: `backend/src/services/ai/mcp/server.rs`

Added whitelist constant and validation function before `start()`:
- `ALLOWED_MCP_COMMANDS`: `["npx", "node", "python", "python3", "uvx", "docker", "deno", "bun"]`
- `SHELL_METACHARACTERS`: `[';', '&', '|', '`', '$', '(', ')', '{', '}', '<', '>', '\n', '\r']`
- `validate_mcp_command(command, args)`: extract basename from path, check whitelist, check args for metacharacters
- Called at start of `start()` before `Command::new(command)`

---

## Fix 4: SSH session auto-cleanup - [x] Done

**Files**: `backend/src/services/ssh_service.rs`, `backend/src/lib.rs`

### 4a. Added activity tracking to `SshSession`
Added `last_activity_secs: Arc<AtomicU64>` field. Initialized with current epoch seconds in `SshSession::new()`. Uses `AtomicU64` for lock-free updates.

### 4b. Added helper function `now_secs()`
Returns current epoch seconds using `SystemTime`.

### 4c. Touch activity on data operations
In `send_data()` and `resize_terminal()`, after the operation, stores current time to `session.last_activity_secs` using `Ordering::Relaxed`.

### 4d. Added `start_cleanup_task()` to `SshService`
Spawns tokio task: every 5 minutes, read-lock sessions, collect stale IDs (>30 min inactive), write-lock and remove (close channel + disconnect handle). Also removes associated exec sessions.

### 4e. Called in `lib.rs`
After `let ssh_service = Arc::new(SshService::new());`, calls `ssh_service.start_cleanup_task();`.

---

## Fix 5: Redis remove unnecessary Mutex - [x] Done

**File**: `backend/src/services/middleware/redis/driver.rs`

### 5a. Derived Clone for RedisConnection
`MultiplexedConnection` and `ClusterConnection` both implement `Clone`. Added `#[derive(Clone)]`.

### 5b. Changed struct field
`connection: Arc<Mutex<RedisConnection>>` -> `connection: Arc<RedisConnection>`

### 5c. Replaced `get_connection()` with `get_connection_clone()`
Returns `RedisConnection` by cloning from Arc (no longer async, no longer returns MutexGuard).

### 5d. Updated all callsites
Updated `execute_raw`, `execute_raw_string`, `execute_info`, `execute_dbsize`, `execute_scan`, `select_database`, `execute_command`, `flush_db`, `flush_all` in `driver.rs`, plus `delete_keys` in `keys.rs`, and `set_list`/`set_set` in `data.rs`.

### 5e. Updated constructor
`Arc::new(Mutex::new(connection))` -> `Arc::new(connection)`. Kept `Mutex` import for `current_db`.

---

## Fix 6: Docker operations timeout - [x] Done

**File**: `backend/src/services/docker/local.rs`

### 6a. Added timeout helper and constants
```rust
const DOCKER_TIMEOUT_SECS: u64 = 30;
const DOCKER_SLOW_TIMEOUT_SECS: u64 = 300;

async fn with_docker_timeout<T>(secs, op, fut) -> Result<T, String>
```

### 6b. Wrapped bollard API calls

**30s timeout**: `test_connection`, `list_containers`, `start_container`, `stop_container`, `restart_container`, `remove_container`, `get_container_logs`, `list_images`, `remove_image`, `get_info`, `get_stats`, `get_settings`, `list_networks`, `inspect_network`, `create_network`, `remove_network`, `connect/disconnect_container_to_network`, `prune_networks`, `list_volumes`, `create_volume`, `remove_volume`, `prune_volumes`, `get_container_stats`, `exec_command`, `exec_resize`

**300s timeout**: `pull_image`, `pull_from_registry`

**No timeout** (long-running): `exec_start_interactive`, `exec_send_data`, `exec_close`, `close`, all compose operations (use `Command` not bollard)

---

## Deferred to Phase 3

| Issue | Reason |
|-------|--------|
| IPC permission tiers (`lib.rs`) | Requires Tauri v2 capability redesign |
| Credentials in frontend localStorage | Requires backend credential store |
| AI API Key plaintext via IPC | Requires backend key management |
| MSSQL connection pooling | Requires bb8/deadpool integration |
| rsa Marvin Attack | No fix available (prefer Ed25519 - docs only) |
| elasticsearch alpha | No stable version available |

---

## Files Modified Summary

| File | Change |
|------|--------|
| `backend/tauri.conf.json` | Set CSP policy |
| `backend/capabilities/default.json` | Remove `**` wildcard, add $APPDATA/$APPLOCALDATA |
| `backend/src/services/ai/mcp/server.rs` | MCP command whitelist + arg validation |
| `backend/src/services/ssh_service.rs` | Activity tracking + cleanup task |
| `backend/src/lib.rs` | Start SSH cleanup task |
| `backend/src/services/middleware/redis/driver.rs` | Remove Mutex, use connection clone |
| `backend/src/services/middleware/redis/keys.rs` | Update get_connection -> get_connection_clone |
| `backend/src/services/middleware/redis/data.rs` | Update get_connection -> get_connection_clone |
| `backend/src/services/docker/local.rs` | Timeout wrappers on bollard calls |

---

## Verification

1. [x] `cargo build` - all Rust changes compile
2. [ ] `npm run tauri dev` - app starts, no CSP errors in DevTools console
3. [ ] Test MCP server with `command: "rm"` - should reject
4. [ ] Test MCP server with `command: "npx"` - should succeed
5. [ ] Test Redis SCAN/INFO/SET/GET - verify concurrent access works
6. [ ] Docker list containers - returns within 30s even if daemon slow
7. [ ] Leave SSH session idle >30min - verify auto-cleanup via `ssh_get_all_sessions`
