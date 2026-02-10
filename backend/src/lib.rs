//! ZWD-OpsBot - Cross-platform Operations Terminal
//!
//! This is the main library for the Tauri backend.

pub mod commands;
pub mod models;
pub mod services;

use std::sync::Arc;
use tauri::Manager;

use commands::{AiServiceState, CryptoServiceState, DatabaseServiceState, DockerServiceState, SftpServiceState, SshServiceState};
#[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
use commands::MiddlewareServiceState;
use services::{AiService, CryptoService, DatabaseService, DockerService, KnownHostsStore, SftpService, SshService};
#[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
use services::MiddlewareService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Services that don't need app_data_dir are initialized here.
    // SSH and Crypto are initialized in setup() after app_data_dir is available.
    let sftp_service = Arc::new(SftpService::new());
    let database_service = Arc::new(DatabaseService::new());
    let ai_service = Arc::new(AiService::new());
    #[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
    let middleware_service = Arc::new(MiddlewareService::new());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SftpServiceState(sftp_service))
        .manage(DatabaseServiceState(database_service))
        .manage(AiServiceState(ai_service));

    #[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
    let builder = builder.manage(MiddlewareServiceState(middleware_service));

    builder
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
            commands::ssh_host_key_response,
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
            commands::sftp_remove_transfer,
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
            commands::db_get_schemas,
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
            #[cfg(feature = "clickhouse")]
            commands::db_get_clickhouse_clusters,
            // Docker commands
            commands::docker_connect,
            commands::docker_test_connection,
            commands::docker_disconnect,
            commands::docker_is_connected,
            commands::docker_list_containers,
            commands::docker_start_container,
            commands::docker_stop_container,
            commands::docker_restart_container,
            commands::docker_remove_container,
            commands::docker_get_logs,
            commands::docker_list_images,
            commands::docker_pull_image,
            commands::docker_remove_image,
            commands::docker_get_info,
            commands::docker_get_stats,
            commands::docker_get_settings,
            commands::docker_update_registry_mirrors,
            commands::docker_stop_daemon,
            commands::docker_restart_daemon,
            // Docker network commands (Phase 2)
            commands::docker_list_networks,
            commands::docker_inspect_network,
            commands::docker_create_network,
            commands::docker_remove_network,
            commands::docker_connect_container_to_network,
            commands::docker_disconnect_container_from_network,
            commands::docker_prune_networks,
            // Docker volume commands (Phase 2)
            commands::docker_list_volumes,
            commands::docker_create_volume,
            commands::docker_remove_volume,
            commands::docker_prune_volumes,
            // Docker stats commands (Phase 2)
            commands::docker_get_container_stats,
            // Docker exec commands (Phase 2)
            commands::docker_exec_command,
            commands::docker_exec_start,
            commands::docker_exec_send_data,
            commands::docker_exec_resize,
            commands::docker_exec_close,
            // Docker Compose commands (Phase 2)
            commands::docker_list_compose_projects,
            commands::docker_get_compose_containers,
            commands::docker_get_compose_content,
            commands::docker_create_compose_project,
            commands::docker_update_compose_content,
            commands::docker_start_compose,
            commands::docker_stop_compose,
            commands::docker_restart_compose,
            commands::docker_remove_compose,
            commands::docker_get_compose_logs,
            commands::docker_get_compose_path,
            // Docker Registry commands (Phase 3)
            commands::docker_list_registries,
            commands::docker_create_registry,
            commands::docker_update_registry,
            commands::docker_delete_registry,
            commands::docker_test_registry,
            commands::docker_test_registry_direct,
            commands::docker_search_registry_images,
            commands::docker_pull_from_registry,
            // Middleware commands (Kafka)
            #[cfg(feature = "kafka")]
            commands::mw_kafka_connect,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_disconnect,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_test_connection,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_is_connected,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_get_cluster_info,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_list_topics,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_get_topic,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_create_topic,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_delete_topic,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_get_topic_config,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_update_topic_config,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_list_consumer_groups,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_get_consumer_group,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_get_consumer_group_offsets,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_delete_consumer_group,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_reset_consumer_group_offsets,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_fetch_messages,
            #[cfg(feature = "kafka")]
            commands::mw_kafka_produce_message,
            // Middleware commands (Redis)
            #[cfg(feature = "redis")]
            commands::mw_redis_connect,
            #[cfg(feature = "redis")]
            commands::mw_redis_disconnect,
            #[cfg(feature = "redis")]
            commands::mw_redis_test_connection,
            #[cfg(feature = "redis")]
            commands::mw_redis_is_connected,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_info,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_databases,
            #[cfg(feature = "redis")]
            commands::mw_redis_select_database,
            #[cfg(feature = "redis")]
            commands::mw_redis_scan_keys,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_key_count,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_key_type,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_key_ttl,
            #[cfg(feature = "redis")]
            commands::mw_redis_set_key_ttl,
            #[cfg(feature = "redis")]
            commands::mw_redis_delete_keys,
            #[cfg(feature = "redis")]
            commands::mw_redis_rename_key,
            #[cfg(feature = "redis")]
            commands::mw_redis_key_exists,
            #[cfg(feature = "redis")]
            commands::mw_redis_get_value,
            #[cfg(feature = "redis")]
            commands::mw_redis_set_value,
            #[cfg(feature = "redis")]
            commands::mw_redis_execute_command,
            #[cfg(feature = "redis")]
            commands::mw_redis_flush_db,
            #[cfg(feature = "redis")]
            commands::mw_redis_flush_all,
            // Middleware commands (Elasticsearch)
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_connect,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_disconnect,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_test_connection,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_is_connected,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_cluster_health,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_cluster_stats,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_nodes,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_shards,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_list_indices,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_index_mapping,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_index_settings,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_index_stats,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_create_index,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_delete_index,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_open_index,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_close_index,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_refresh_index,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_update_index_mapping,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_update_index_settings,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_get_document,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_create_document,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_update_document,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_delete_document,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_bulk_operation,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_search,
            #[cfg(feature = "elasticsearch")]
            commands::mw_es_sql_query,
            // AI commands
            commands::ai_ollama_connect,
            commands::ai_ollama_disconnect,
            commands::ai_ollama_test_connection,
            commands::ai_ollama_is_connected,
            commands::ai_ollama_get_status,
            commands::ai_ollama_list_models,
            commands::ai_ollama_pull_model,
            commands::ai_ollama_delete_model,
            commands::ai_ollama_get_running_models,
            // AI service control commands
            commands::ai_ollama_start_service,
            commands::ai_ollama_stop_service,
            commands::ai_ollama_restart_service,
            commands::ai_ollama_is_service_running,
            // GPU monitoring commands
            commands::ai_detect_gpu,
            commands::ai_get_gpu_info,
            commands::ai_get_gpu_processes,
            commands::ai_get_gpu_history,
            // Cloud API commands
            commands::ai_cloud_api_test_connection,
            commands::ai_cloud_api_list_models,
            commands::ai_cloud_api_get_default_models,
            // TensorRT LLM commands
            commands::ai_tensorrt_connect,
            commands::ai_tensorrt_disconnect,
            commands::ai_tensorrt_test_connection,
            commands::ai_tensorrt_is_connected,
            commands::ai_tensorrt_get_status,
            commands::ai_tensorrt_list_models,
            commands::ai_tensorrt_deploy_model,
            commands::ai_tensorrt_start_model,
            commands::ai_tensorrt_stop_model,
            commands::ai_tensorrt_get_logs,
            // MCP commands
            commands::ai_mcp_create_server,
            commands::ai_mcp_delete_server,
            commands::ai_mcp_list_servers,
            commands::ai_mcp_get_server,
            commands::ai_mcp_start_server,
            commands::ai_mcp_stop_server,
            commands::ai_mcp_bind_tool,
            commands::ai_mcp_unbind_tool,
            commands::ai_mcp_get_tools,
            commands::ai_mcp_update_server,
            // OpenWebUI commands
            commands::ai_openwebui_detect,
            commands::ai_openwebui_open,
            // Remote AI management commands
            commands::ai_remote_detect_environment,
            commands::ai_remote_ollama_command,
            commands::ai_remote_sync_models,
            commands::ai_remote_get_gpu_info,
            commands::ai_remote_detect_gpu,
            commands::ai_remote_get_gpu_processes,
            // Utility commands
            commands::append_to_file,
            // Crypto commands (password-based for export/import)
            commands::encrypt_config,
            commands::decrypt_config,
            commands::is_config_encrypted,
            // Storage crypto commands (keyring-based for local storage)
            commands::encrypt_storage,
            commands::decrypt_storage,
            commands::is_storage_encrypted,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
                std::path::PathBuf::from(".")
            });

            // Initialize logging for both debug and release
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            #[cfg(not(debug_assertions))]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize OS keyring storage key for encryption
            let crypto_service = match services::get_or_create_storage_key(&app_data_dir) {
                Ok(key) => {
                    log::info!("Storage encryption key initialized (keyring/file)");
                    Arc::new(CryptoService::new_with_storage_key(key))
                }
                Err(e) => {
                    log::warn!("Failed to init storage key ({}), using V1 fallback", e);
                    Arc::new(CryptoService::new())
                }
            };
            app.manage(CryptoServiceState(crypto_service));

            // Initialize SSH known hosts store for TOFU
            let known_hosts = match KnownHostsStore::load(&app_data_dir) {
                Ok(kh) => Arc::new(kh),
                Err(e) => {
                    log::warn!("Failed to load known_hosts ({}), using empty store", e);
                    Arc::new(KnownHostsStore::new(app_data_dir.join("known_hosts")))
                }
            };

            let ssh_service = Arc::new(SshService::new_with_known_hosts(known_hosts));
            ssh_service.start_cleanup_task();
            let docker_service = Arc::new(DockerService::new(ssh_service.clone()));
            app.manage(SshServiceState(ssh_service));
            app.manage(DockerServiceState(docker_service));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
