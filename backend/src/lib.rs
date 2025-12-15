//! ZWD-OpsBot - Cross-platform Operations Terminal
//!
//! This is the main library for the Tauri backend.

pub mod commands;
pub mod models;
pub mod services;

use std::sync::Arc;
use tauri::Manager;

use commands::{DatabaseServiceState, SftpServiceState, SshServiceState};
use services::{DatabaseService, SftpService, SshService};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize services
    let ssh_service = Arc::new(SshService::new());
    let sftp_service = Arc::new(SftpService::new());
    let database_service = Arc::new(DatabaseService::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SshServiceState(ssh_service))
        .manage(SftpServiceState(sftp_service))
        .manage(DatabaseServiceState(database_service))
        .invoke_handler(tauri::generate_handler![
            // SSH commands
            commands::ssh_connect,
            commands::ssh_send_data,
            commands::ssh_resize,
            commands::ssh_disconnect,
            commands::ssh_get_session,
            commands::ssh_get_all_sessions,
            commands::ssh_is_connected,
            commands::ssh_test_connection,
            commands::ssh_reconnect,
            commands::ssh_exec_command,
            // SFTP commands
            commands::sftp_open,
            commands::sftp_close,
            commands::sftp_list_dir,
            commands::sftp_get_current_path,
            commands::sftp_canonicalize,
            commands::sftp_mkdir,
            commands::sftp_remove_file,
            commands::sftp_remove_dir,
            commands::sftp_rename,
            commands::sftp_read_file,
            commands::sftp_write_file,
            commands::sftp_stat,
            commands::sftp_get_transfers,
            commands::sftp_cleanup_transfers,
            commands::sftp_download,
            commands::sftp_upload,
            commands::sftp_cancel_transfer,
            // Database commands
            commands::db_connect,
            commands::db_disconnect,
            commands::db_test_connection,
            commands::db_is_connected,
            commands::db_execute_sql,
            commands::db_get_databases,
            commands::db_get_tables,
            commands::db_get_table_structure,
            commands::db_get_views,
            commands::db_get_routines,
            commands::db_get_objects_count,
            commands::db_get_table_ddl,
            commands::db_rename_table,
            commands::db_drop_table,
            commands::db_get_foreign_keys,
            commands::db_get_check_constraints,
            commands::db_get_triggers,
            commands::db_get_table_options,
            commands::db_get_table_structure_ext,
            // Utility commands
            commands::append_to_file,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                // Open devtools in debug mode
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
