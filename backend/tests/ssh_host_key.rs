//! Integration tests for SSH host-key (TOFU) verification.
//!
//! The `known_hosts_detects_changed_key` test is pure and always runs.
//!
//! The live test needs a reachable SSH server with key auth and is ignored by
//! default. For the `mbp` host run:
//!   ZWD_TEST_SSH_HOST=10.66.66.2 ZWD_TEST_SSH_USER=Administrator \
//!   ZWD_TEST_SSH_KEY_PATH=$HOME/.ssh/id_rsa \
//!   cargo test --test ssh_host_key -- --ignored

use std::path::PathBuf;
use std::sync::Arc;

use zwd_opsbot_lib::models::{JumpHostConfig, SshAuthType, SshConnectRequest};
use zwd_opsbot_lib::services::known_hosts::{HostKeyLookup, KnownHostsStore};
use zwd_opsbot_lib::services::SshService;

fn temp_known_hosts_path(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "zwd_test_known_hosts_{}_{}",
        std::process::id(),
        tag
    ))
}

/// The core TOFU decision: a matching key is accepted, a *changed* key is
/// flagged as a mismatch (never silently matched), and an unseen host is
/// unknown. This is the security property behind routing test connections
/// through the real store instead of accept-all.
#[tokio::test]
async fn known_hosts_detects_changed_key() {
    let path = temp_known_hosts_path("unit");
    let _ = std::fs::remove_file(&path);
    let store = KnownHostsStore::new(path.clone());

    let host = "203.0.113.10:22";
    let kt = "ssh-ed25519";
    let key_a = "AAAAAAAA_original_key";
    let key_b = "BBBBBBBB_attacker_key";

    // Nothing stored yet.
    assert!(matches!(
        store.lookup(host, kt, key_a).await,
        HostKeyLookup::Unknown
    ));

    store.add(host, kt, key_a).await.expect("add host key");

    // Same key + type -> Match.
    assert!(matches!(
        store.lookup(host, kt, key_a).await,
        HostKeyLookup::Match
    ));

    // Different key, SAME type -> Mismatch (the changed-key / MITM signal).
    match store.lookup(host, kt, key_b).await {
        HostKeyLookup::Mismatch { old_key } => assert_eq!(old_key, key_a),
        other => panic!("expected Mismatch, got {:?}", lookup_name(&other)),
    }

    // Different KEY TYPE for the same host -> Unknown, not Mismatch: a host-key
    // algorithm change must not raise a false "host key changed" alarm (#11).
    assert!(matches!(
        store.lookup(host, "rsa-sha2-512", key_a).await,
        HostKeyLookup::Unknown
    ));

    // A different host is still Unknown.
    assert!(matches!(
        store.lookup("198.51.100.5:22", kt, key_a).await,
        HostKeyLookup::Unknown
    ));

    let _ = std::fs::remove_file(&path);
}

/// The Debug output of a connect request must never contain the password,
/// private key, or passphrase (a stray `log::debug!("{:?}", req)` would
/// otherwise write them to disk). Pure test, always runs.
#[test]
fn debug_redacts_secrets() {
    let req = SshConnectRequest {
        connection_id: "c".to_string(),
        host: "h".to_string(),
        port: 22,
        username: "u".to_string(),
        auth_type: "password".to_string(),
        password: Some("SUPERSECRET".to_string()),
        private_key: Some("PRIVKEYDATA".to_string()),
        passphrase: Some("PASSPHRASE".to_string()),
        jump_host: Some(JumpHostConfig {
            host: "j".to_string(),
            port: 22,
            username: "ju".to_string(),
            auth_type: SshAuthType::Password,
            password: Some("JUMPSECRET".to_string()),
            private_key: None,
            passphrase: None,
        }),
        terminal_size: Default::default(),
    };
    let dbg = format!("{req:?}");
    for secret in ["SUPERSECRET", "PRIVKEYDATA", "PASSPHRASE", "JUMPSECRET"] {
        assert!(!dbg.contains(secret), "Debug leaked secret {secret}: {dbg}");
    }
    assert!(dbg.contains("<redacted>"), "expected redaction markers: {dbg}");
}

/// Live regression test: with verification enabled, `test_connection` must
/// still succeed against a real server, and it must persist the server's key
/// on first sight (TOFU) so a later connection matches instead of re-prompting.
#[tokio::test]
#[ignore]
async fn test_connection_against_mbp_verifies_host_key() {
    let host = match std::env::var("ZWD_TEST_SSH_HOST") {
        Ok(h) => h,
        Err(_) => return, // gate: skip unless a target is provided
    };
    let port: u16 = std::env::var("ZWD_TEST_SSH_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(22);
    let user = std::env::var("ZWD_TEST_SSH_USER").expect("ZWD_TEST_SSH_USER");
    let key_path = std::env::var("ZWD_TEST_SSH_KEY_PATH").expect("ZWD_TEST_SSH_KEY_PATH");
    let private_key = std::fs::read_to_string(&key_path).expect("read private key");
    let passphrase = std::env::var("ZWD_TEST_SSH_PASSPHRASE").ok();

    let path = temp_known_hosts_path("live");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store.clone());

    let request = SshConnectRequest {
        connection_id: "test-mbp".to_string(),
        host: host.clone(),
        port,
        username: user,
        auth_type: "key".to_string(),
        password: None,
        private_key: Some(private_key),
        passphrase,
        jump_host: None,
        terminal_size: Default::default(),
    };

    let host_port = format!("{}:{}", host, port);

    // Host is unseen before the first test.
    assert_eq!(
        store.host_key_count(&host_port).await,
        0,
        "store should start empty for {host_port}"
    );

    // First test connection: real handshake + auth must succeed.
    service
        .test_connection(&request, None)
        .await
        .expect("first test_connection should succeed");

    // The server's real key was persisted.
    assert!(
        store.host_key_count(&host_port).await >= 1,
        "host key should have been persisted after first connect"
    );

    // Second test connection now takes the Match path (no prompt) and must
    // still succeed — verification-on does not break real connections.
    service
        .test_connection(&request, None)
        .await
        .expect("second test_connection (Match path) should succeed");

    let _ = std::fs::remove_file(&path);
}

fn lookup_name(l: &HostKeyLookup) -> &'static str {
    match l {
        HostKeyLookup::Match => "Match",
        HostKeyLookup::Mismatch { .. } => "Mismatch",
        HostKeyLookup::Unknown => "Unknown",
    }
}

/// Read from a terminal-output channel until `needle` appears (or timeout).
async fn read_until(
    rx: &mut futures::channel::mpsc::Receiver<Vec<u8>>,
    needle: &str,
    secs: u64,
) -> bool {
    use futures::StreamExt;
    let mut buf = Vec::new();
    tokio::time::timeout(std::time::Duration::from_secs(secs), async {
        while let Some(chunk) = rx.next().await {
            buf.extend_from_slice(&chunk);
            if String::from_utf8_lossy(&buf).contains(needle) {
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false)
}

fn mbp_key_request() -> Option<SshConnectRequest> {
    let host = std::env::var("ZWD_TEST_SSH_HOST").ok()?;
    let port: u16 = std::env::var("ZWD_TEST_SSH_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(22);
    let username = std::env::var("ZWD_TEST_SSH_USER").expect("ZWD_TEST_SSH_USER");
    let key_path = std::env::var("ZWD_TEST_SSH_KEY_PATH").expect("ZWD_TEST_SSH_KEY_PATH");
    let private_key = std::fs::read_to_string(&key_path).expect("read private key");
    Some(SshConnectRequest {
        connection_id: "test-reconnect".to_string(),
        host,
        port,
        username,
        auth_type: "key".to_string(),
        password: None,
        private_key: Some(private_key),
        passphrase: std::env::var("ZWD_TEST_SSH_PASSPHRASE").ok(),
        jump_host: None,
        terminal_size: Default::default(),
    })
}

/// Live test that inbound server data keeps a session active even with no user
/// input, so the 30-minute stale reaper won't kill a streaming session. Pre-fix,
/// only send_data/resize bumped the activity clock; data() did not.
#[tokio::test]
#[ignore]
async fn inbound_data_keeps_session_active() {
    let request = match mbp_key_request() {
        Some(r) => r,
        None => return,
    };

    let path = temp_known_hosts_path("activity");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store);

    let (tx, mut rx) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let id = service
        .connect_with_key(request, tx, None)
        .await
        .expect("connect");

    // send_data bumps the activity clock now (t0). The command's output is
    // delayed ~2s and `6*7` evaluates to 42 only in the OUTPUT (the input echo
    // shows the literal "$((6*7))"), so matching "VAL_42_END" waits for genuine
    // inbound data rather than the echo of what we typed.
    service
        .send_data(&id, b"sleep 2; echo VAL_$((6*7))_END\n")
        .await
        .expect("send");
    let t0 = service
        .session_last_activity(&id)
        .await
        .expect("activity t0");

    assert!(
        read_until(&mut rx, "VAL_42_END", 8).await,
        "should receive the delayed inbound output"
    );

    let t1 = service
        .session_last_activity(&id)
        .await
        .expect("activity t1");
    assert!(
        t1 >= t0 + 1,
        "inbound data should advance last_activity (t0={t0}, t1={t1})"
    );

    service.disconnect(&id).await.expect("disconnect");
    let _ = std::fs::remove_file(&path);
}

/// A normal disconnect must reap the session's interactive exec sessions
/// instead of orphaning them (a memory leak over connect/exec/disconnect cycles).
#[tokio::test]
#[ignore]
async fn disconnect_reaps_exec_sessions() {
    let request = match mbp_key_request() {
        Some(r) => r,
        None => return,
    };

    let path = temp_known_hosts_path("execreap");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store);

    let (tx, _rx) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let id = service
        .connect_with_key(request, tx, None)
        .await
        .expect("connect");

    // `cat` with no args blocks on stdin, so the exec session stays open.
    let (otx, _orx) = futures::channel::mpsc::unbounded::<Vec<u8>>();
    let _exec_id = service
        .exec_interactive_start(&id, "cat", 80, 24, otx)
        .await
        .expect("exec start");
    assert_eq!(
        service.exec_session_count().await,
        1,
        "exec session should be registered"
    );

    service.disconnect(&id).await.expect("disconnect");
    assert_eq!(
        service.exec_session_count().await,
        0,
        "disconnect must reap the session's exec sessions"
    );

    let _ = std::fs::remove_file(&path);
}

/// Connecting to a black-holed host must fail fast via the connect timeout,
/// not hang for the OS TCP timeout (~1-2 min). Gated on the SSH env only so it
/// runs alongside the other live tests; it targets a non-routable address.
#[tokio::test]
#[ignore]
async fn connect_to_dead_host_times_out() {
    if std::env::var("ZWD_TEST_SSH_HOST").is_err() {
        return;
    }
    let path = temp_known_hosts_path("timeout");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store);

    let request = SshConnectRequest {
        connection_id: "dead".to_string(),
        host: "10.255.255.1".to_string(), // black-hole: SYN silently dropped
        port: 22,
        username: "x".to_string(),
        auth_type: "password".to_string(),
        password: Some("x".to_string()),
        private_key: None,
        passphrase: None,
        jump_host: None,
        terminal_size: Default::default(),
    };

    let start = std::time::Instant::now();
    let result = service.test_connection(&request, None).await;
    let elapsed = start.elapsed();

    assert!(result.is_err(), "connecting to a dead host must fail");
    assert!(
        elapsed < std::time::Duration::from_secs(30),
        "connect should time out (~20s), not hang; took {elapsed:?}"
    );
    let _ = std::fs::remove_file(&path);
}

/// Live test that the bounded terminal-data channel delivers a large
/// multi-packet burst end-to-end without deadlocking. Backpressure blocks the
/// producer when full (it never drops), so seeing the final marker proves the
/// whole burst flowed through the bounded channel.
#[tokio::test]
#[ignore]
async fn bounded_channel_delivers_burst_without_loss() {
    let request = match mbp_key_request() {
        Some(r) => r,
        None => return,
    };

    let path = temp_known_hosts_path("burst");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store);

    let (tx, mut rx) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let id = service
        .connect_with_key(request, tx, None)
        .await
        .expect("connect");

    // 5000 lines then a marker; `6*7` => 42 appears only in the final output.
    service
        .send_data(&id, b"seq 1 5000; echo END_$((6*7))\n")
        .await
        .expect("send burst");
    assert!(
        read_until(&mut rx, "END_42", 15).await,
        "the full 5000-line burst should arrive through the bounded channel"
    );

    service.disconnect(&id).await.expect("disconnect");
    let _ = std::fs::remove_file(&path);
}

/// Live test that exec_command does NOT hold the sessions lock across its
/// output drain: a slow command on session A must not block a concurrent
/// connect + exec on session B. Pre-fix, A held sessions.read() for the whole
/// drain and B's sessions.write() (session insert) stalled behind it.
#[tokio::test]
#[ignore]
async fn exec_does_not_hold_sessions_lock() {
    let req_a = match mbp_key_request() {
        Some(r) => r,
        None => return,
    };
    let req_b = mbp_key_request().expect("env present");

    let path = temp_known_hosts_path("execlock");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = Arc::new(SshService::new_with_known_hosts(store));

    let (txa, _rxa) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let id_a = service
        .connect_with_key(req_a, txa, None)
        .await
        .expect("connect A");

    // Slow command on A holds a channel + drains for ~3s.
    let svc = service.clone();
    let id_a2 = id_a.clone();
    let slow = tokio::spawn(async move { svc.exec_command(&id_a2, "sleep 3; echo SLOW_DONE").await });

    // Let the slow exec get going (and, in the buggy code, take the read lock).
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;

    // Concurrently connect B (needs sessions.write()) and run a quick command.
    let (txb, _rxb) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let start = std::time::Instant::now();
    let id_b = service
        .connect_with_key(req_b, txb, None)
        .await
        .expect("connect B");
    let fast_out = service
        .exec_command(&id_b, "echo FAST_DONE")
        .await
        .expect("exec B");
    let elapsed = start.elapsed();

    assert!(fast_out.contains("FAST_DONE"), "B command should run");
    assert!(
        elapsed < std::time::Duration::from_millis(1500),
        "connect+exec on B took {elapsed:?}; exec on A appears to hold the sessions lock"
    );

    let slow_out = slow.await.unwrap().expect("slow exec A");
    assert!(slow_out.contains("SLOW_DONE"));

    service.disconnect(&id_a).await.expect("disconnect A");
    service.disconnect(&id_b).await.expect("disconnect B");
    let _ = std::fs::remove_file(&path);
}

/// Live regression test for the reconnect contract: reconnect must REUSE the
/// same session id (so the frontend's existing listeners stay valid) and the
/// terminal must be live again afterward — not a silently-dead session.
#[tokio::test]
#[ignore]
async fn reconnect_reuses_session_id_and_stays_live() {
    let request = match mbp_key_request() {
        Some(r) => r,
        None => return,
    };

    let path = temp_known_hosts_path("reconnect");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store);

    let (tx1, mut rx1) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let session_id = service
        .connect_with_key(request, tx1, None)
        .await
        .expect("initial connect should succeed");

    // Live before reconnect (6*7 => 42 only in the evaluated output).
    service
        .send_data(&session_id, b"echo MARKA_$((6*7))_END\n")
        .await
        .expect("send before reconnect");
    assert!(
        read_until(&mut rx1, "MARKA_42_END", 8).await,
        "terminal should be live before reconnect"
    );

    // Reconnect on a fresh output channel.
    let (tx2, mut rx2) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let reconnected_id = service
        .reconnect(&session_id, tx2, None)
        .await
        .expect("reconnect should succeed");

    // THE contract: same id, so the frontend keeps working without rewiring.
    assert_eq!(
        reconnected_id, session_id,
        "reconnect must reuse the original session id"
    );
    assert!(
        service.is_connected(&session_id).await,
        "session should be connected after reconnect"
    );

    // Live AFTER reconnect on the new channel — proves it is not a dead terminal.
    service
        .send_data(&session_id, b"echo MARKB_$((6*7))_END\n")
        .await
        .expect("send after reconnect");
    assert!(
        read_until(&mut rx2, "MARKB_42_END", 8).await,
        "terminal should be live after reconnect (reused id)"
    );

    service.disconnect(&session_id).await.expect("disconnect");
    let _ = std::fs::remove_file(&path);
}

/// Live jump-host regression + security test. Uses the target itself as the
/// bastion: SSH to the bastion, then a tunneled second SSH back to the bastion's
/// own sshd over 127.0.0.1. Proves the tunneled second hop works AND that the
/// TARGET host key is verified against the app store — a store entry for the
/// target only exists if the app (not the bastion's `ssh`) performed the
/// verification, which the pre-fix accept-new exec path never did.
#[tokio::test]
#[ignore]
async fn jump_host_verifies_target_key_and_opens_shell() {
    use futures::StreamExt;

    let bastion = match std::env::var("ZWD_TEST_SSH_HOST") {
        Ok(h) => h,
        Err(_) => return,
    };
    let port: u16 = std::env::var("ZWD_TEST_SSH_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(22);
    let user = std::env::var("ZWD_TEST_SSH_USER").expect("ZWD_TEST_SSH_USER");
    let key_path = std::env::var("ZWD_TEST_SSH_KEY_PATH").expect("ZWD_TEST_SSH_KEY_PATH");
    let private_key = std::fs::read_to_string(&key_path).expect("read private key");
    let passphrase = std::env::var("ZWD_TEST_SSH_PASSPHRASE").ok();

    let path = temp_known_hosts_path("jump");
    let _ = std::fs::remove_file(&path);
    let store = Arc::new(KnownHostsStore::new(path.clone()));
    let service = SshService::new_with_known_hosts(store.clone());

    // Target = the bastion's own sshd over loopback, reached THROUGH the bastion.
    let request = SshConnectRequest {
        connection_id: "test-jump".to_string(),
        host: "127.0.0.1".to_string(),
        port: 22,
        username: user.clone(),
        auth_type: "key".to_string(),
        password: None,
        private_key: Some(private_key.clone()),
        passphrase: passphrase.clone(),
        jump_host: Some(JumpHostConfig {
            host: bastion,
            port,
            username: user,
            auth_type: SshAuthType::Key,
            password: None,
            private_key: Some(private_key),
            passphrase,
        }),
        terminal_size: Default::default(),
    };

    let (tx, mut rx) = futures::channel::mpsc::channel::<Vec<u8>>(1024);
    let session_id = service
        .connect_with_key(request, tx, None)
        .await
        .expect("jump-host connect should succeed");

    assert!(
        service.is_connected(&session_id).await,
        "session should be connected"
    );

    // The app verified & persisted the TARGET's key (127.0.0.1:22). Pre-fix this
    // entry never existed — the bastion's `ssh` handled the target key itself.
    assert!(
        store.host_key_count("127.0.0.1:22").await >= 1,
        "target host key should have been verified and persisted by the app"
    );

    // A real shell on the target: `6*7` evaluates to 42 only in the command
    // *output*, so matching "MARK_42_END" excludes the PTY echo of the input
    // and proves the command actually ran on the target.
    service
        .send_data(&session_id, b"echo MARK_$((6*7))_END\n")
        .await
        .expect("send_data");

    let mut buf = Vec::new();
    let found = tokio::time::timeout(std::time::Duration::from_secs(8), async {
        while let Some(chunk) = rx.next().await {
            buf.extend_from_slice(&chunk);
            if String::from_utf8_lossy(&buf).contains("MARK_42_END") {
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false);
    assert!(
        found,
        "expected evaluated shell output from target; got: {}",
        String::from_utf8_lossy(&buf)
    );

    service.disconnect(&session_id).await.expect("disconnect");
    let _ = std::fs::remove_file(&path);
}
