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
    let key_a = "AAAAAAAA_original_key";
    let key_b = "BBBBBBBB_attacker_key";

    // Nothing stored yet.
    assert!(matches!(
        store.lookup(host, key_a).await,
        HostKeyLookup::Unknown
    ));

    store
        .add(host, "ssh-ed25519", key_a)
        .await
        .expect("add host key");

    // Same key -> Match.
    assert!(matches!(
        store.lookup(host, key_a).await,
        HostKeyLookup::Match
    ));

    // Different key for a known host -> Mismatch (the changed-key / MITM signal).
    match store.lookup(host, key_b).await {
        HostKeyLookup::Mismatch { old_key } => assert_eq!(old_key, key_a),
        other => panic!("expected Mismatch, got {:?}", lookup_name(&other)),
    }

    // A different host is still Unknown.
    assert!(matches!(
        store.lookup("198.51.100.5:22", key_a).await,
        HostKeyLookup::Unknown
    ));

    let _ = std::fs::remove_file(&path);
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
    assert!(
        matches!(store.lookup(&host_port, "x").await, HostKeyLookup::Unknown),
        "store should start empty for {host_port}"
    );

    // First test connection: real handshake + auth must succeed.
    service
        .test_connection(&request, None)
        .await
        .expect("first test_connection should succeed");

    // The server's real key was persisted (a bogus key now reads as Mismatch,
    // proving the host is known rather than Unknown).
    assert!(
        matches!(
            store.lookup(&host_port, "bogus").await,
            HostKeyLookup::Mismatch { .. }
        ),
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

    let (tx, mut rx) = futures::channel::mpsc::unbounded::<Vec<u8>>();
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
        matches!(
            store.lookup("127.0.0.1:22", "bogus").await,
            HostKeyLookup::Mismatch { .. }
        ),
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
