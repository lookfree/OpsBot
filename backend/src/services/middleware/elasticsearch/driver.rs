//! Elasticsearch driver implementation
//!
//! Main driver struct and connection management.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use elasticsearch::auth::Credentials;
use elasticsearch::cert::{Certificate, CertificateValidation};
use elasticsearch::http::transport::{
    CloudConnectionPool, SingleNodeConnectionPool, TransportBuilder,
};
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
        // For Elastic Cloud, derive the endpoint from the Cloud ID; otherwise use
        // the first configured node URL.
        let mut builder = if matches!(request.auth_type, EsAuthType::Cloud) {
            let cloud_id = request
                .cloud_id
                .as_ref()
                .ok_or("Cloud ID required for cloud auth")?;
            let pool = CloudConnectionPool::new(cloud_id)
                .map_err(|e| format!("Invalid Cloud ID: {}", e))?;
            TransportBuilder::new(pool)
        } else {
            // Guard against an empty node list (indexing nodes[0] would panic).
            let first_node = request
                .nodes
                .first()
                .ok_or("At least one node URL is required")?;
            let url = Url::parse(first_node)
                .map_err(|e| format!("Invalid node URL '{}': {}", first_node, e))?;
            TransportBuilder::new(SingleNodeConnectionPool::new(url))
        };

        // Configure authentication
        builder = Self::configure_auth(builder, request)?;

        // Configure TLS (validation is only relaxed when explicitly requested)
        builder = Self::configure_tls(builder, request.tls.as_ref())?;

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
                // Credentials::ApiKey(id, key) base64-encodes "id:key" itself, so we
                // must supply the raw id/key pair. Accept either the raw "id:api_key"
                // form or its base64 encoding (the value Elasticsearch returns).
                let (id, key) = parse_api_key(api_key)?;
                builder = builder.auth(Credentials::ApiKey(id, key));
            }
            EsAuthType::Cloud => {
                // The endpoint is derived from the Cloud ID in build_transport;
                // here we only attach the Basic credentials it authenticates with.
                match (request.username.as_ref(), request.password.as_ref()) {
                    (Some(u), Some(p)) => {
                        builder = builder.auth(Credentials::Basic(u.clone(), p.clone()));
                    }
                    _ => {
                        return Err(
                            "Username and password required for Elastic Cloud auth".to_string()
                        );
                    }
                }
            }
        }
        Ok(builder)
    }

    /// Configure TLS settings
    ///
    /// Certificate validation is only disabled when the user explicitly asks for
    /// it (`tls.enabled && !tls.reject_unauthorized`). HTTPS URLs without an
    /// explicit TLS config keep the secure default validation — silently skipping
    /// validation would expose the connection to MITM attacks.
    fn configure_tls(
        mut builder: TransportBuilder,
        tls_config: Option<&EsTlsConfig>,
    ) -> Result<TransportBuilder, String> {
        if let Some(tls) = tls_config {
            if tls.enabled && !tls.reject_unauthorized {
                // User explicitly opted out of certificate validation.
                builder = builder.cert_validation(CertificateValidation::None);
            } else if let Some(ca) = tls.ca.as_ref().map(|c| c.trim()).filter(|c| !c.is_empty()) {
                // Validate the server certificate against the user-supplied CA
                // (PEM), so a private-CA/self-signed cluster works without
                // disabling validation entirely.
                let cert = Certificate::from_pem(ca.as_bytes())
                    .map_err(|e| format!("Invalid CA certificate: {}", e))?;
                builder = builder.cert_validation(CertificateValidation::Full(cert));
            }
            // Otherwise use the default (full) validation.
        }
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

/// Parse an Elasticsearch API key into its `(id, api_key)` parts.
///
/// Accepts either the raw `"id:api_key"` form or its base64 encoding (the
/// `encoded` value returned by the create-API-key endpoint).
fn parse_api_key(api_key: &str) -> Result<(String, String), String> {
    let trimmed = api_key.trim();
    if let Some((id, key)) = trimmed.split_once(':') {
        return Ok((id.to_string(), key.to_string()));
    }
    // No colon: assume base64("id:api_key").
    let decoded = BASE64
        .decode(trimmed)
        .map_err(|_| "Invalid API key: expected 'id:api_key' or its base64 encoding".to_string())?;
    let decoded = String::from_utf8(decoded)
        .map_err(|_| "Invalid API key: base64 did not decode to valid UTF-8".to_string())?;
    let (id, key) = decoded
        .split_once(':')
        .ok_or("Invalid API key: decoded value must be 'id:api_key'")?;
    Ok((id.to_string(), key.to_string()))
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
