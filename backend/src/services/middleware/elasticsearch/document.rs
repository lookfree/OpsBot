//! Elasticsearch document operations
//!
//! Handles document CRUD and bulk operations.

use elasticsearch::params::{OpType, Refresh};
use elasticsearch::{BulkOperation, BulkParts, DeleteParts, GetParts, IndexParts, UpdateParts};

use crate::models::{
    EsBulkItemResponse, EsBulkOperation, EsBulkOperationType, EsBulkResponse,
    EsCreateDocRequest, EsDocResponse, EsDocument, EsUpdateDocRequest,
};

use super::driver::ElasticsearchDriver;

/// Get a document by ID
pub async fn get_document(
    driver: &ElasticsearchDriver,
    index: &str,
    id: &str,
) -> Result<EsDocument, String> {
    let response = driver
        .client()
        .get(GetParts::IndexId(index, id))
        .send()
        .await
        .map_err(|e| format!("Failed to get document: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        return Err(format!("Document '{}' not found in index '{}'", id, index));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(EsDocument {
        index: json["_index"].as_str().unwrap_or("").to_string(),
        id: json["_id"].as_str().unwrap_or("").to_string(),
        version: json["_version"].as_i64().unwrap_or(0),
        source: json["_source"].clone(),
    })
}

/// Create a new document
pub async fn create_document(
    driver: &ElasticsearchDriver,
    request: EsCreateDocRequest,
) -> Result<EsDocResponse, String> {
    // With an explicit id, use op_type=create so an existing document is NOT
    // silently overwritten (ES returns 409 instead). Without an id, ES
    // auto-generates one and always creates.
    let index_request = if let Some(id) = &request.id {
        driver
            .client()
            .index(IndexParts::IndexId(&request.index, id))
            .op_type(OpType::Create)
    } else {
        driver.client().index(IndexParts::Index(&request.index))
    };

    let response = index_request
        // Wait for the change to be searchable so an immediate list reload sees it
        .refresh(Refresh::WaitFor)
        .body(request.source)
        .send()
        .await
        .map_err(|e| format!("Failed to create document: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to create document: {}",
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(EsDocResponse {
        index: json["_index"].as_str().unwrap_or("").to_string(),
        id: json["_id"].as_str().unwrap_or("").to_string(),
        version: json["_version"].as_i64().unwrap_or(0),
        result: json["result"].as_str().unwrap_or("").to_string(),
    })
}

/// Update an existing document
pub async fn update_document(
    driver: &ElasticsearchDriver,
    request: EsUpdateDocRequest,
) -> Result<EsDocResponse, String> {
    let body = serde_json::json!({
        "doc": request.doc
    });

    let response = driver
        .client()
        .update(UpdateParts::IndexId(&request.index, &request.id))
        .refresh(Refresh::WaitFor)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to update document: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to update document '{}': {}",
            request.id,
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(EsDocResponse {
        index: json["_index"].as_str().unwrap_or("").to_string(),
        id: json["_id"].as_str().unwrap_or("").to_string(),
        version: json["_version"].as_i64().unwrap_or(0),
        result: json["result"].as_str().unwrap_or("").to_string(),
    })
}

/// Delete a document by ID
pub async fn delete_document(
    driver: &ElasticsearchDriver,
    index: &str,
    id: &str,
) -> Result<(), String> {
    let response = driver
        .client()
        .delete(DeleteParts::IndexId(index, id))
        .refresh(Refresh::WaitFor)
        .send()
        .await
        .map_err(|e| format!("Failed to delete document: {}", e))?;

    let status = response.status_code();
    if !status.is_success() && status.as_u16() != 404 {
        return Err(format!(
            "Failed to delete document '{}' from index '{}'",
            id, index
        ));
    }

    Ok(())
}

/// Execute bulk operations
pub async fn bulk_operation(
    driver: &ElasticsearchDriver,
    operations: Vec<EsBulkOperation>,
) -> Result<EsBulkResponse, String> {
    if operations.is_empty() {
        return Ok(EsBulkResponse {
            took: 0,
            errors: false,
            items: vec![],
        });
    }

    let body: Vec<BulkOperation<serde_json::Value>> = build_bulk_operations(&operations);

    let response = driver
        .client()
        .bulk(BulkParts::None)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to execute bulk operation: {}", e))?;

    // A whole-request failure (auth, payload too large, 5xx) won't contain an
    // `items` array, so check the HTTP status before treating it as success.
    let status = response.status_code();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Bulk operation failed ({}): {}",
            status.as_u16(),
            if body.is_empty() { "empty response" } else { &body }
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let items = parse_bulk_items(&json);

    Ok(EsBulkResponse {
        took: json["took"].as_i64().unwrap_or(0),
        errors: json["errors"].as_bool().unwrap_or(false),
        items,
    })
}

/// Build bulk operations from our custom operation type
fn build_bulk_operations(operations: &[EsBulkOperation]) -> Vec<BulkOperation<serde_json::Value>> {
    operations
        .iter()
        .filter_map(|op| {
            let source = op.source.clone().unwrap_or(serde_json::json!({}));
            match op.operation {
                EsBulkOperationType::Index => {
                    let mut builder = BulkOperation::index(source).index(&op.index);
                    if let Some(id) = &op.id {
                        builder = builder.id(id);
                    }
                    Some(builder.into())
                }
                EsBulkOperationType::Create => {
                    // Create requires an ID
                    if let Some(id) = &op.id {
                        Some(
                            BulkOperation::create(id.clone(), source)
                                .index(&op.index)
                                .into(),
                        )
                    } else {
                        // Fall back to index if no ID provided
                        Some(BulkOperation::index(source).index(&op.index).into())
                    }
                }
                EsBulkOperationType::Update => {
                    if let Some(id) = &op.id {
                        let doc = serde_json::json!({ "doc": source });
                        Some(BulkOperation::update(id, doc).index(&op.index).into())
                    } else {
                        None // Update requires an ID
                    }
                }
                EsBulkOperationType::Delete => {
                    if let Some(id) = &op.id {
                        Some(BulkOperation::<serde_json::Value>::delete(id).index(&op.index).into())
                    } else {
                        None // Delete requires an ID
                    }
                }
            }
        })
        .collect()
}

/// Parse bulk response items
fn parse_bulk_items(json: &serde_json::Value) -> Vec<EsBulkItemResponse> {
    let Some(items) = json["items"].as_array() else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let (op_type, op_result) = obj.iter().next()?;

            let error = op_result.get("error").map(|e| {
                if let Some(reason) = e.get("reason") {
                    reason.as_str().unwrap_or("").to_string()
                } else {
                    e.to_string()
                }
            });

            Some(EsBulkItemResponse {
                operation: op_type.clone(),
                index: op_result["_index"].as_str().unwrap_or("").to_string(),
                id: op_result["_id"].as_str().unwrap_or("").to_string(),
                status: op_result["status"].as_i64().unwrap_or(0) as i32,
                error,
            })
        })
        .collect()
}
