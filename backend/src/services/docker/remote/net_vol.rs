//! Network and volume listing/inspection for the remote Docker driver.
//! Method bodies extracted from `mod.rs` verbatim.

use super::*;
use crate::models::docker::NetworkContainer;

impl RemoteDockerDriver {
    pub(super) async fn list_networks_impl(&self) -> Result<Vec<NetworkInfo>, String> {
        let format = r#"--format '{"ID":"{{.ID}}","Name":"{{.Name}}","Driver":"{{.Driver}}","Scope":"{{.Scope}}","CreatedAt":"{{.CreatedAt}}","Internal":"{{.Internal}}"}'"#;
        let output = self.exec_docker_cmd(&format!("network ls {}", format)).await?;

        let mut networks = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let id = json["ID"].as_str().unwrap_or_default().to_string();
                let name = json["Name"].as_str().unwrap_or_default().to_string();

                // Get additional info by inspecting the network
                let ipam_info = self.get_network_ipam(&id).await.unwrap_or_default();

                networks.push(NetworkInfo {
                    id,
                    name,
                    driver: json["Driver"].as_str().unwrap_or_default().to_string(),
                    scope: json["Scope"].as_str().unwrap_or_default().to_string(),
                    created: json["CreatedAt"].as_str().unwrap_or_default().to_string(),
                    ipam_subnet: ipam_info.0,
                    ipam_gateway: ipam_info.1,
                    containers_count: ipam_info.2,
                    internal: json["Internal"].as_str().unwrap_or("false") == "true",
                });
            }
        }

        Ok(networks)
    }

    pub(super) async fn inspect_network_impl(&self, network_id: &str) -> Result<NetworkDetail, String> {
        let output = self.exec_docker_cmd(&format!("network inspect {}", shq(network_id))).await?;
        let json_array: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse network inspect output: {}", e))?;

        let json = json_array.first()
            .ok_or_else(|| "No network found".to_string())?;

        // Parse containers
        let containers: Vec<NetworkContainer> = json["Containers"]
            .as_object()
            .map(|c| {
                c.iter()
                    .map(|(id, info)| NetworkContainer {
                        container_id: id.clone(),
                        name: info["Name"].as_str().unwrap_or_default().to_string(),
                        ipv4_address: info["IPv4Address"].as_str().map(|s| s.to_string()),
                        ipv6_address: info["IPv6Address"].as_str().map(|s| s.to_string()),
                        mac_address: info["MacAddress"].as_str().map(|s| s.to_string()),
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Parse IPAM config
        let ipam_config = json["IPAM"]["Config"]
            .as_array()
            .and_then(|arr| arr.first());

        let info = NetworkInfo {
            id: json["Id"].as_str().unwrap_or_default().to_string(),
            name: json["Name"].as_str().unwrap_or_default().to_string(),
            driver: json["Driver"].as_str().unwrap_or_default().to_string(),
            scope: json["Scope"].as_str().unwrap_or_default().to_string(),
            created: json["Created"].as_str().unwrap_or_default().to_string(),
            ipam_subnet: ipam_config.and_then(|c| c["Subnet"].as_str().map(|s| s.to_string())),
            ipam_gateway: ipam_config.and_then(|c| c["Gateway"].as_str().map(|s| s.to_string())),
            containers_count: containers.len() as u32,
            internal: json["Internal"].as_bool().unwrap_or(false),
        };

        // Parse options and labels
        let options: HashMap<String, String> = json["Options"]
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        let labels: HashMap<String, String> = json["Labels"]
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        Ok(NetworkDetail {
            info,
            containers,
            options,
            labels,
        })
    }

    pub(super) async fn list_volumes_impl(&self) -> Result<Vec<VolumeInfo>, String> {
        let format = r#"--format '{"Name":"{{.Name}}","Driver":"{{.Driver}}","Mountpoint":"{{.Mountpoint}}","Scope":"{{.Scope}}"}'"#;
        let output = self.exec_docker_cmd(&format!("volume ls {}", format)).await?;

        let mut volumes = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let name = json["Name"].as_str().unwrap_or_default().to_string();

                // Get additional info by inspecting the volume
                let (created, labels, size) = self.get_volume_details(&name).await.unwrap_or_default();

                volumes.push(VolumeInfo {
                    name,
                    driver: json["Driver"].as_str().unwrap_or_default().to_string(),
                    mountpoint: json["Mountpoint"].as_str().unwrap_or_default().to_string(),
                    created,
                    size,
                    scope: json["Scope"].as_str().unwrap_or("local").to_string(),
                    labels,
                });
            }
        }

        Ok(volumes)
    }
}
