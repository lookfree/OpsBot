//! Pure parsing/calculation helpers for the local Docker driver.
//! Free functions extracted from `mod.rs` verbatim. No logic changes.

use crate::models::docker::PortMapping;

/// Calculate CPU usage percentage from stats
pub(super) fn calculate_cpu_percent(stats: &bollard::container::Stats) -> f64 {
    let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as i64
        - stats.precpu_stats.cpu_usage.total_usage as i64;
    let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as i64
        - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as i64;

    if system_delta > 0 && cpu_delta > 0 {
        let cpu_count = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;
        (cpu_delta as f64 / system_delta as f64) * cpu_count * 100.0
    } else {
        0.0
    }
}

/// Parse compose status string like "running(2)" or "exited(1), running(1)"
/// Returns (running_count, total_count, status_string)
pub(super) fn parse_compose_status(status_str: &str) -> (u32, u32, String) {
    use regex::Regex;

    let re = Regex::new(r"(\w+)\((\d+)\)").unwrap();
    let mut running_count = 0u32;
    let mut total_count = 0u32;

    for cap in re.captures_iter(status_str) {
        let state = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let count: u32 = cap.get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);

        total_count += count;
        if state == "running" {
            running_count = count;
        }
    }

    let status = if running_count == 0 {
        "stopped".to_string()
    } else if running_count == total_count {
        "running".to_string()
    } else {
        "partial".to_string()
    };

    (running_count, total_count, status)
}

/// Parse ports string like "0.0.0.0:5432->5432/tcp, 0.0.0.0:5433->5433/tcp"
pub(super) fn parse_ports_string(ports_str: &str) -> Vec<PortMapping> {
    use regex::Regex;

    let mut ports = Vec::new();
    if ports_str.is_empty() {
        return ports;
    }

    // Pattern: "0.0.0.0:5432->5432/tcp" or "5432/tcp"
    let re = Regex::new(r"(?:(\d+\.\d+\.\d+\.\d+):)?(\d+)->(\d+)/(\w+)").unwrap();

    for cap in re.captures_iter(ports_str) {
        let host_ip = cap.get(1).map(|m| m.as_str().to_string());
        let host_port: Option<u16> = cap.get(2).and_then(|m| m.as_str().parse().ok());
        let container_port: u16 = cap.get(3)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        let protocol = cap.get(4)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "tcp".to_string());

        if container_port > 0 {
            ports.push(PortMapping {
                container_port,
                host_port,
                protocol,
                host_ip,
            });
        }
    }

    ports
}
