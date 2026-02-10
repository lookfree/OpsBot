# P2 Security Fixes Implementation Plan

## Context

P0 (8 categories) and P1 (6 fixes) are complete. This plan addresses the remaining P2 (Medium) security issues identified during a comprehensive codebase audit covering backend, frontend, and crypto/config areas. Focuses on 8 practical fixes that reduce attack surface without major architectural changes.

---

## Fix 1: MySQL/MariaDB SSL default — change `disabled` to `preferred`

**Files**: `backend/src/services/database/mysql.rs`, `backend/src/services/database/mariadb.rs`

Changed `ssl-mode=disabled` to `ssl-mode=preferred` in both `connect()` and `test_connection()` methods so connections use TLS when the server supports it, but still fall back for servers without SSL.

**Status**: [x] Complete

---

## Fix 2: PostgreSQL URL validation

**File**: `backend/src/services/database/postgresql.rs`

Added scheme validation in `connect_url()` and `test_connection_url()` to reject non-PostgreSQL URLs. Only `postgres://` and `postgresql://` schemes are accepted.

**Status**: [x] Complete

---

## Fix 3: Tighten SQL identifier validation

**File**: `backend/src/services/database/utils.rs`

- Removed spaces from allowed characters (no database/table names should have spaces in normal use)
- Added checks that identifiers don't start/end with dots and have no consecutive dots

**Status**: [x] Complete

---

## Fix 4: Error message sanitization in `commands/utils.rs`

**File**: `backend/src/commands/utils.rs`

OS error messages are now logged server-side but replaced with generic messages returned to the frontend, preventing internal path leakage.

**Status**: [x] Complete

---

## Fix 5: Registry credentials — use stdin instead of CLI args

**File**: `backend/src/services/docker/registry_helpers.rs`

Extracted `run_curl_with_auth()` helper function that passes credentials via `--config -` (stdin) instead of `-u user:pass` CLI args, preventing credential exposure in process lists (`ps aux`). Applied to all 3 locations that previously used `-u`.

**Status**: [x] Complete

---

## Fix 6: Remove dangerouslySetInnerHTML from ERDiagramCanvas

**File**: `front/components/database/designer/ERDiagramCanvas.tsx`

Replaced template literal + `dangerouslySetInnerHTML` with proper React SVG elements (`<defs>`, `<pattern>`, `<path>`) for the grid pattern rendering.

**Status**: [x] Complete

---

## Fix 7: Reset password visibility on dialog close

**Files**:
- `front/components/ssh/SshConnectionDialog.tsx` — reset showPassword + showPassphrase
- `front/components/database/DatabaseConnectionDialog.tsx` — reset showPassword
- `front/components/kafka/KafkaConnectionDialog.tsx` — reset showPassword
- `front/components/middleware/MiddlewareConnectionDialog.tsx` — reset showPassword
- `front/components/middleware/redis/RedisConnectionDialog.tsx` — reset showPassword + showSentinelPassword

Added `setShowPassword(false)` (and `setShowPassphrase(false)` / `setShowSentinelPassword(false)` where applicable) in each dialog's `useEffect` that triggers when `open` changes.

**Status**: [x] Complete

---

## Fix 8: Sanitize error messages in database drivers

**Files**: `mysql.rs`, `mariadb.rs`, `postgresql.rs`

Connection errors in `connect()` and `test_connection()` methods now log the full sqlx error server-side via `log::error!()` but return a generic message to the frontend, preventing leakage of server versions, IPs, and socket paths.

**Status**: [x] Complete

---

## Deferred to Phase 3

| Issue | Reason |
|-------|--------|
| SSH host key verification | Requires UI for host key confirmation flow |
| Storage encryption key derivation | Requires migration of existing encrypted data |
| IPC permission tiers | Requires Tauri v2 capability redesign |
| Frontend localStorage credentials | Requires backend credential store |
| MSSQL connection pooling | Requires bb8/deadpool integration |
