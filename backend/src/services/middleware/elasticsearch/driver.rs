//! Elasticsearch driver implementation
//!
//! Main driver struct and connection management.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use elasticsearch::auth::Credentials;
use elasticsearch::cert::CertificateValidation;
use elasticsearch::http::transport::{SingleNodeConnectionPool, TransportBuilder};
use elasticsearch::Elasticsearch;
use url::Url;

use crate::models::{
    EsAuthType, EsBulkOperation, EsBulkResponse, EsClusterHealth, EsClusterStats,
    EsConnectRequest, EsConnectionInfo, EsCreateDocRequest, EsCreateIndexRequest,
    EsDocResponse, EsDocument, EsIndexStats, EsIndexSummary, EsNodeInfo, EsSearchRequest,
    EsSearchResponse, EsShardInfo, EsSqlResponse, EsTlsConfig, EsUpdateDocRequest,
};
use crate::services::middleware::traits::SearchEngineDriver;

use super::cluster;
use super::document;
use super::index;
use super::query;

/// Elasticsearch driver implementing the SearchEngineDriver trait
pub struct ElasticsearchDriver {
    client: Elasticsearch,
    nodes: Vec<String>,
}

impl ElasticsearchDriver {
    /// Create a new Elasticsearch driver and connect to the cluster
    pub async fn connect(request: EsConnectRequest) -> Result<Self, String> {
        let transport = Self::build_transport(&request)?;
        let client = Elasticsearch::new(transport);

        let driver = Self {
            client,
            nodes: request.nodes.clone(),
        };

        // Verify connection by fetching cluster info
        driver.test_connection().await?;

        Ok(driver)
    }

    /// Build transport with authentication and TLS configuration
    fn build_transport(
        request: &EsConnectRequest,
    ) -> Result<elasticsearch::http::transport::Transport, String> {
        let url = Url::parse(&request.nodes[0])
            .map_err(|e| format!("Invalid node URL '{}': {}", request.nodes[0], e))?;

        // Check if URL uses HTTPS
        let is_https = url.scheme() == "https";

        let conn_pool = SingleNodeConnectionPool::new(url);
        let mut builder = TransportBuilder::new(conn_pool);

        // Configure authentication
        builder = Self::configure_auth(builder, request)?;

        // Configure TLS - auto-handle HTTPS URLs
        builder = Self::configure_tls(builder, request.tls.as_ref(), is_https)?;

        // Configure proxy - default to direct connection unless explicitly requested
        if !request.use_proxy {
            builder = builder.disable_proxy();
        }

        // Configure timeout
        if let Some(timeout_ms) = request.request_timeout {
            builder = builder.timeout(Duration::from_millis(timeout_ms));
        }

        builder
            .build()
            .map_err(|e| format!("Failed to build transport: {}", e))
    }

    /// Configure authentication based on auth type
    fn configure_auth(
        mut builder: TransportBuilder,
        request: &EsConnectRequest,
    ) -> Result<TransportBuilder, String> {
        match &request.auth_type {
            EsAuthType::None => {}
            EsAuthType::Basic => {
                let username = request
                    .username
                    .as_ref()
                    .ok_or("Username required for basic auth")?;
                let password = request
                    .password
                    .as_ref()
                    .ok_or("Password required for basic auth")?;
                builder = builder.auth(Credentials::Basic(username.clone(), password.clone()));
            }
            EsAuthType::ApiKey => {
                let api_key = request
                    .api_key
                    .as_ref()
                    .ok_or("API key required for API key auth")?;
                // API key format can be base64 encoded "id:key"
                builder = builder.auth(Credentials::ApiKey(
                    api_key.clone(),
                    String::new(), // API key already contains both id and key
                ));
            }
            EsAuthType::Cloud => {
                let cloud_id = request
                    .cloud_id
                    .as_ref()
                    .ok_or("Cloud ID required for cloud auth")?;
                let username = request.username.as_ref();
                let password = request.password.as_ref();

                match (username, password) {
                    (Some(u), Some(p)) => {
                        builder = builder.auth(Credentials::Basic(u.clone(), p.clone()));
                    }
                    _ => {
                        return Err(
                            "Username and password required for Elastic Cloud auth".to_string()
                        );
                    }
                }
                // Note: cloud_id would typically be parsed to extract the ES endpoint
                // For now, we expect the nodes array to contain the actual endpoint
                let _ = cloud_id; // Suppress unused warning
            }
        }
        Ok(builder)
    }

    /// Configure TLS settings
    ///
    /// When `is_https` is true (URL starts with https://), TLS is required.
    /// If no explicit TLS config is provided, we default to skipping certificate
    /// validation for HTTPS URLs to ensure connectivity (common for dev/test).
    fn configure_tls(
        mut builder: TransportBuilder,
        tls_config: Option<&EsTlsConfig>,
        is_https: bool,
    ) -> Result<TransportBuilder, String> {
        if let Some(tls) = tls_config {
            // Explicit TLS config provided
            if tls.enabled && !tls.reject_unauthorized {
                // User explicitly disabled certificate validation
                builder = builder.cert_validation(CertificateValidation::None);
            }
            // When tls.enabled && tls.reject_unauthorized, use default validation
        } else if is_https {
            // HTTPS URL but no explicit TLS config - default to skip validation
            // This handles common cases like self-signed certs in dev environments
            builder = builder.cert_validation(CertificateValidation::None);
        }
        // For HTTP URLs without TLS config, no special handling needed
        Ok(builder)
    }

    /// Get the internal Elasticsearch client
    pub(super) fn client(&self) -> &Elasticsearch {
        &self.client
    }

    /// Get the configured nodes
    #[allow(dead_code)]
    pub fn nodes(&self) -> &[String] {
        &self.nodes
    }
}

#[async_trait]
impl SearchEngineDriver for ElasticsearchDriver {
    async fn test_connection(&self) -> Result<EsConnectionInfo, String> {
        cluster::test_connection(self).await
    }

    async fn close(&self) {
        // elasticsearch-rs client is cleaned up on drop
    }

    // ============ Cluster Operations ============

    async fn get_cluster_health(&self) -> Result<EsClusterHealth, String> {
        cluster::get_cluster_health(self).await
    }

    async fn get_cluster_stats(&self) -> Result<EsClusterStats, String> {
        cluster::get_cluster_stats(self).await
    }

    async fn get_nodes(&self) -> Result<Vec<EsNodeInfo>, String> {
        cluster::get_nodes(self).await
    }

    async fn get_shards(&self) -> Result<Vec<EsShardInfo>, String> {
        cluster::get_shards(self).await
    }

    // ============ Index Operations ============

    async fn get_indices(&self, pattern: Option<&str>) -> Result<Vec<EsIndexSummary>, String> {
        index::get_indices(self, pattern).await
    }

    async fn get_index_mapping(&self, index_name: &str) -> Result<serde_json::Value, String> {
        index::get_index_mapping(self, index_name).await
    }

    async fn get_index_settings(&self, index_name: &str) -> Result<serde_json::Value, String> {
        index::get_index_settings(self, index_name).await
    }

    async fn get_index_stats(&self, index_name: &str) -> Result<EsIndexStats, String> {
        index::get_index_stats(self, index_name).await
    }

    async fn create_index(&self, request: EsCreateIndexRequest) -> Result<(), String> {
        index::create_index(self, request).await
    }

    async fn delete_index(&self, index_name: &str) -> Result<(), String> {
        index::delete_index(self, index_name).await
    }

    async fn open_index(&self, index_name: &str) -> Result<(), String> {
        index::open_index(self, index_name).await
    }

    async fn close_index(&self, index_name: &str) -> Result<(), String> {
        index::close_index(self, index_name).await
    }

    async fn refresh_index(&self, index_name: &str) -> Result<(), String> {
        index::refresh_index(self, index_name).await
    }

    async fn update_index_mapping(
        &self,
        index_name: &str,
        mapping: serde_json::Value,
    ) -> Result<(), String> {
        index::update_index_mapping(self, index_name, mapping).await
    }

    async fn update_index_settings(
        &self,
        index_name: &str,
        settings: serde_json::Value,
    ) -> Result<(), String> {
        index::update_index_settings(self, index_name, settings).await
    }

    // ============ Document Operations ============

    async fn get_document(&self, index: &str, id: &str) -> Result<EsDocument, String> {
        document::get_document(self, index, id).await
    }

    async fn create_document(&self, request: EsCreateDocRequest) -> Result<EsDocResponse, String> {
        document::create_document(self, request).await
    }

    async fn update_document(&self, request: EsUpdateDocRequest) -> Result<EsDocResponse, String> {
        document::update_document(self, request).await
    }

    async fn delete_document(&self, index: &str, id: &str) -> Result<(), String> {
        document::delete_document(self, index, id).await
    }

    async fn bulk_operation(
        &self,
        operations: Vec<EsBulkOperation>,
    ) -> Result<EsBulkResponse, String> {
        document::bulk_operation(self, operations).await
    }

    // ============ Search Operations ============

    async fn search(&self, request: EsSearchRequest) -> Result<EsSearchResponse, String> {
        query::search(self, request).await
    }

    async fn sql_query(&self, sql: &str) -> Result<EsSqlResponse, String> {
        query::sql_query(self, sql).await
    }
}

/// Elasticsearch session wrapper
pub struct ElasticsearchSession {
    pub connection_id: String,
    pub driver: Arc<ElasticsearchDriver>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

impl ElasticsearchSession {
    pub fn new(connection_id: String, driver: Arc<ElasticsearchDriver>) -> Self {
        Self {
            connection_id,
            driver,
            connected_at: chrono::Utc::now(),
        }
    }
}
