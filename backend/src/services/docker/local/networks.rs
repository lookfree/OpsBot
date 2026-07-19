//! Network and volume listing/inspection for the local Docker driver.
//! Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;
use bollard::network::ListNetworksOptions;
use bollard::volume::ListVolumesOptions;
use crate::models::docker::NetworkContainer;

impl LocalDockerDriver {
    pub(super) async fn list_networks_impl(&self) -> Result<Vec<NetworkInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_networks", async {
            let options = ListNetworksOptions::<String> {
                ..Default::default()
            };

            let networks = self
                .client
                .list_networks(Some(options))
                .await
                .map_err(|e| format!("Failed to list networks: {}", e))?;

            let result = networks
                .into_iter()
                .map(|net| {
                    let ipam_config = net.ipam.as_ref().and_then(|ipam| {
                        ipam.config.as_ref().and_then(|configs| configs.first())
                    });

                    NetworkInfo {
                        id: net.id.unwrap_or_default(),
                        name: net.name.unwrap_or_default(),
                        driver: net.driver.unwrap_or_default(),
                        scope: net.scope.unwrap_or_default(),
                        created: net.created.unwrap_or_default(),
                        ipam_subnet: ipam_config.and_then(|c| c.subnet.clone()),
                        ipam_gateway: ipam_config.and_then(|c| c.gateway.clone()),
                        containers_count: net.containers.as_ref().map(|c| c.len() as u32).unwrap_or(0),
                        internal: net.internal.unwrap_or(false),
                    }
                })
                .collect();

            Ok(result)
        }).await
    }

    pub(super) async fn inspect_network_impl(&self, network_id: &str) -> Result<NetworkDetail, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "inspect_network", async {
            let network = self
                .client
                .inspect_network::<String>(network_id, None)
                .await
                .map_err(|e| format!("Failed to inspect network: {}", e))?;

            let ipam_config = network.ipam.as_ref().and_then(|ipam| {
                ipam.config.as_ref().and_then(|configs| configs.first())
            });

            let containers: Vec<NetworkContainer> = network
                .containers
                .as_ref()
                .map(|c| {
                    c.iter()
                        .map(|(id, info)| NetworkContainer {
                            container_id: id.clone(),
                            name: info.name.clone().unwrap_or_default(),
                            ipv4_address: info.ipv4_address.clone(),
                            ipv6_address: info.ipv6_address.clone(),
                            mac_address: info.mac_address.clone(),
                        })
                        .collect()
                })
                .unwrap_or_default();

            let info = NetworkInfo {
                id: network.id.clone().unwrap_or_default(),
                name: network.name.clone().unwrap_or_default(),
                driver: network.driver.clone().unwrap_or_default(),
                scope: network.scope.clone().unwrap_or_default(),
                created: network.created.clone().unwrap_or_default(),
                ipam_subnet: ipam_config.and_then(|c| c.subnet.clone()),
                ipam_gateway: ipam_config.and_then(|c| c.gateway.clone()),
                containers_count: containers.len() as u32,
                internal: network.internal.unwrap_or(false),
            };

            Ok(NetworkDetail {
                info,
                containers,
                options: network.options.unwrap_or_default(),
                labels: network.labels.unwrap_or_default(),
            })
        }).await
    }

    pub(super) async fn list_volumes_impl(&self) -> Result<Vec<VolumeInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_volumes", async {
            let options = ListVolumesOptions::<String> {
                ..Default::default()
            };

            let response = self
                .client
                .list_volumes(Some(options))
                .await
                .map_err(|e| format!("Failed to list volumes: {}", e))?;

            let volumes = response.volumes.unwrap_or_default();
            let result = volumes
                .into_iter()
                .map(|vol| {
                    let scope = vol.scope
                        .map(|s| format!("{:?}", s).to_lowercase())
                        .unwrap_or_else(|| "local".to_string());

                    VolumeInfo {
                        name: vol.name,
                        driver: vol.driver,
                        mountpoint: vol.mountpoint,
                        created: vol.created_at.unwrap_or_default(),
                        size: vol.usage_data.as_ref().map(|u| u.size as u64),
                        scope,
                        labels: vol.labels,
                    }
                })
                .collect();

            Ok(result)
        }).await
    }
}
