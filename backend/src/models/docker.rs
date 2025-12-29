use serde::{Deserialize, Serialize};

/// Docker 连接类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DockerConnectionType {
    /// 本地 Docker (通过 Unix Socket 或 Windows Named Pipe)
    Local,
    /// 远程 Docker (通过 SSH 隧道转发)
    Ssh,
}

/// Docker 连接请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerConnectRequest {
    /// 连接 ID
    pub connection_id: String,
    /// 连接类型
    pub connection_type: DockerConnectionType,
    /// SSH 连接 ID (仅 SSH 类型需要)
    pub ssh_connection_id: Option<String>,
}

/// 端口映射信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortMapping {
    /// 容器端口
    pub container_port: u16,
    /// 主机端口
    pub host_port: Option<u16>,
    /// 协议 (tcp/udp)
    pub protocol: String,
    /// 主机 IP
    pub host_ip: Option<String>,
}

/// 容器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInfo {
    /// 容器 ID
    pub id: String,
    /// 容器名称
    pub name: String,
    /// 镜像名称
    pub image: String,
    /// 状态描述 (e.g., "Up 2 hours")
    pub status: String,
    /// 状态 (running, stopped, paused, exited, etc.)
    pub state: String,
    /// 创建时间 (Unix 时间戳)
    pub created: i64,
    /// 端口映射
    pub ports: Vec<PortMapping>,
}

/// 镜像信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    /// 镜像 ID
    pub id: String,
    /// 标签列表
    pub tags: Vec<String>,
    /// 镜像大小 (字节)
    pub size: u64,
    /// 创建时间 (Unix 时间戳)
    pub created: i64,
}

/// 容器日志请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerLogsRequest {
    /// 连接 ID
    pub connection_id: String,
    /// 容器 ID
    pub container_id: String,
    /// 获取最后 N 行
    pub tail: Option<u32>,
    /// 是否跟踪日志 (暂不支持)
    pub follow: bool,
}

/// 拉取镜像进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullProgress {
    /// 状态信息
    pub status: String,
    /// 当前进度
    pub current: Option<u64>,
    /// 总大小
    pub total: Option<u64>,
}

/// Docker 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerTestResult {
    /// 是否成功
    pub success: bool,
    /// Docker 版本
    pub version: Option<String>,
    /// API 版本
    pub api_version: Option<String>,
    /// 错误信息
    pub error: Option<String>,
}

// ========== 概览页面模型 ==========

/// Docker 系统信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    /// Docker 版本
    pub version: String,
    /// API 版本
    pub api_version: String,
    /// 操作系统
    pub os: String,
    /// 架构
    pub arch: String,
    /// 内核版本
    pub kernel_version: String,
    /// Docker 根目录
    pub root_dir: String,
    /// 存储驱动
    pub storage_driver: String,
    /// 运行中容器数
    pub containers_running: u32,
    /// 暂停容器数
    pub containers_paused: u32,
    /// 已停止容器数
    pub containers_stopped: u32,
    /// 镜像总数
    pub images: u32,
    /// 总内存 (bytes)
    pub memory_total: u64,
    /// CPU 核心数
    pub cpus: u32,
}

/// Docker 统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStats {
    /// 运行中容器数
    pub containers_running: u32,
    /// 已停止容器数
    pub containers_stopped: u32,
    /// 容器总数
    pub containers_total: u32,
    /// 镜像数量
    pub images_count: u32,
    /// 镜像总大小 (bytes)
    pub images_size: u64,
}

// ========== 设置页面模型 ==========

/// Docker 设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerSettings {
    /// 镜像加速器列表
    pub registry_mirrors: Vec<String>,
    /// Docker 存储路径
    pub storage_path: String,
    /// Docker Socket 路径
    pub socket_path: String,
    /// Cgroup 驱动 (cgroupfs/systemd)
    pub cgroup_driver: String,
    /// Live Restore 是否启用
    pub live_restore: bool,
    /// IPv6 是否启用
    pub ipv6_enabled: bool,
}

/// 更新镜像加速器请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRegistryMirrorsRequest {
    /// 连接 ID
    pub connection_id: String,
    /// 镜像加速器列表
    pub mirrors: Vec<String>,
}

// ========== 网络管理模型 (第二期) ==========

/// 网络信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    /// 网络 ID
    pub id: String,
    /// 网络名称
    pub name: String,
    /// 驱动类型 (bridge, host, overlay, macvlan, none)
    pub driver: String,
    /// 范围 (local, swarm, global)
    pub scope: String,
    /// 创建时间
    pub created: String,
    /// IPAM 子网
    pub ipam_subnet: Option<String>,
    /// IPAM 网关
    pub ipam_gateway: Option<String>,
    /// 连接的容器数量
    pub containers_count: u32,
    /// 是否为内部网络
    pub internal: bool,
}

/// 网络详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDetail {
    /// 基本信息
    #[serde(flatten)]
    pub info: NetworkInfo,
    /// 连接的容器列表
    pub containers: Vec<NetworkContainer>,
    /// 网络选项
    pub options: std::collections::HashMap<String, String>,
    /// 标签
    pub labels: std::collections::HashMap<String, String>,
}

/// 网络中的容器
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkContainer {
    /// 容器 ID
    pub container_id: String,
    /// 容器名称
    pub name: String,
    /// 容器 IPv4 地址
    pub ipv4_address: Option<String>,
    /// 容器 IPv6 地址
    pub ipv6_address: Option<String>,
    /// MAC 地址
    pub mac_address: Option<String>,
}

/// 创建网络请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNetworkRequest {
    /// 网络名称
    pub name: String,
    /// 驱动类型
    pub driver: Option<String>,
    /// 子网 (CIDR 格式，如 172.20.0.0/16)
    pub subnet: Option<String>,
    /// 网关
    pub gateway: Option<String>,
    /// 是否为内部网络
    pub internal: Option<bool>,
    /// 标签
    pub labels: Option<std::collections::HashMap<String, String>>,
}

// ========== 存储卷管理模型 (第二期) ==========

/// 存储卷信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    /// 存储卷名称
    pub name: String,
    /// 驱动类型
    pub driver: String,
    /// 挂载点路径
    pub mountpoint: String,
    /// 创建时间
    pub created: String,
    /// 存储卷大小 (字节，可能为空)
    pub size: Option<u64>,
    /// 范围 (local, global)
    pub scope: String,
    /// 标签
    pub labels: std::collections::HashMap<String, String>,
}

/// 存储卷详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeDetail {
    /// 基本信息
    #[serde(flatten)]
    pub info: VolumeInfo,
    /// 驱动选项
    pub options: Option<std::collections::HashMap<String, String>>,
    /// 使用此存储卷的容器列表
    pub used_by: Vec<String>,
}

/// 创建存储卷请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVolumeRequest {
    /// 存储卷名称
    pub name: String,
    /// 驱动类型
    pub driver: Option<String>,
    /// 驱动选项
    pub driver_opts: Option<std::collections::HashMap<String, String>>,
    /// 标签
    pub labels: Option<std::collections::HashMap<String, String>>,
}

/// 清理结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    /// 删除的对象数量
    pub deleted_count: u32,
    /// 释放的空间 (字节)
    pub space_reclaimed: u64,
}

// ========== 容器终端模型 (第二期) ==========

/// 创建 Exec 会话请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecCreateRequest {
    /// 容器 ID
    pub container_id: String,
    /// 执行的命令
    pub cmd: Vec<String>,
    /// 是否分配 TTY
    pub tty: bool,
    /// 终端宽度
    pub cols: Option<u16>,
    /// 终端高度
    pub rows: Option<u16>,
}

/// Exec 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecSession {
    /// 会话 ID
    pub session_id: String,
    /// Exec ID (Docker exec instance ID)
    pub exec_id: String,
    /// 容器 ID
    pub container_id: String,
}

/// 调整终端大小请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResizeRequest {
    /// 会话 ID
    pub session_id: String,
    /// 终端宽度
    pub cols: u16,
    /// 终端高度
    pub rows: u16,
}

// ========== 容器资源监控模型 (第二期) ==========

/// 容器资源统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStats {
    /// 容器 ID
    pub container_id: String,
    /// 容器名称
    pub name: String,
    /// CPU 使用率 (百分比)
    pub cpu_percent: f64,
    /// 内存使用量 (字节)
    pub memory_usage: u64,
    /// 内存限制 (字节)
    pub memory_limit: u64,
    /// 内存使用率 (百分比)
    pub memory_percent: f64,
    /// 网络接收字节数
    pub network_rx: u64,
    /// 网络发送字节数
    pub network_tx: u64,
    /// 磁盘读取字节数
    pub block_read: u64,
    /// 磁盘写入字节数
    pub block_write: u64,
    /// 统计时间戳
    pub timestamp: i64,
}

// ========== Docker Compose 编排模型 (第二期) ==========

/// Compose 项目来源
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComposeSource {
    /// 本地创建
    Local,
    /// 应用商店
    AppStore,
    /// 外部导入
    External,
}

/// Compose 项目信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeProject {
    /// 项目名称
    pub name: String,
    /// 项目来源
    pub source: ComposeSource,
    /// 工作目录路径
    pub path: String,
    /// 创建时间 (Unix 时间戳)
    pub created_at: i64,
    /// 运行中的容器数
    pub running_count: u32,
    /// 总容器数
    pub total_count: u32,
    /// 状态 (running, stopped, partial)
    pub status: String,
}

/// Compose 项目中的容器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeContainer {
    /// 容器 ID
    pub id: String,
    /// 服务名称
    pub service: String,
    /// 容器名称
    pub name: String,
    /// 镜像名称
    pub image: String,
    /// 状态
    pub state: String,
    /// 状态描述
    pub status: String,
    /// CPU 使用率 (百分比)
    pub cpu_percent: Option<f64>,
    /// 内存使用率 (百分比)
    pub memory_percent: Option<f64>,
    /// 端口映射
    pub ports: Vec<PortMapping>,
}

/// Compose 项目详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeProjectDetail {
    /// 基本信息
    #[serde(flatten)]
    pub project: ComposeProject,
    /// 容器列表
    pub containers: Vec<ComposeContainer>,
    /// docker-compose.yml 内容
    pub compose_content: String,
}

/// 创建 Compose 项目请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateComposeRequest {
    /// 项目名称
    pub name: String,
    /// docker-compose.yml 内容
    pub content: String,
    /// 工作目录路径 (可选，默认为 ~/docker-compose/{name})
    pub path: Option<String>,
}

/// 更新 Compose 内容请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateComposeRequest {
    /// 项目名称
    pub name: String,
    /// docker-compose.yml 内容
    pub content: String,
}

/// Compose 项目日志请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeLogsRequest {
    /// 项目名称
    pub name: String,
    /// 获取最后 N 行
    pub tail: Option<u32>,
    /// 特定服务名称 (可选，不指定则获取所有服务)
    pub service: Option<String>,
}

// ========== 仓库管理模型 (第三期) ==========

/// 仓库类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RegistryType {
    /// Docker Hub 官方仓库
    DockerHub,
    /// Harbor 私有仓库
    Harbor,
    /// Nexus Repository
    Nexus,
    /// 自建仓库 (HTTP/HTTPS Registry)
    Custom,
}

impl Default for RegistryType {
    fn default() -> Self {
        Self::DockerHub
    }
}

/// 仓库连接状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RegistryStatus {
    /// 已连接
    Connected,
    /// 未连接
    Disconnected,
    /// 同步中
    Syncing,
    /// 错误
    Error(String),
}

impl Default for RegistryStatus {
    fn default() -> Self {
        Self::Disconnected
    }
}

/// 仓库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryInfo {
    /// 仓库 ID (UUID)
    pub id: String,
    /// 仓库名称
    pub name: String,
    /// 仓库类型
    pub registry_type: RegistryType,
    /// 仓库地址 (如 https://registry.example.com)
    pub url: String,
    /// 用户名 (可选)
    pub username: Option<String>,
    /// 密码 (内存中明文，不序列化)
    #[serde(skip)]
    pub password: Option<String>,
    /// 加密后的密码 (存储用)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_password: Option<String>,
    /// 下载限速 (KB/s, 可选)
    pub download_limit: Option<u32>,
    /// 跳过 TLS 证书验证
    pub skip_tls_verify: bool,
    /// 连接状态
    pub status: RegistryStatus,
    /// 最后同步时间 (Unix timestamp)
    pub last_sync_at: Option<i64>,
    /// 创建时间
    pub created_at: i64,
    /// 更新时间
    pub updated_at: i64,
}

/// 创建仓库请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRegistryRequest {
    /// 仓库名称
    pub name: String,
    /// 仓库类型
    pub registry_type: RegistryType,
    /// 仓库地址
    pub url: String,
    /// 用户名 (可选)
    pub username: Option<String>,
    /// 密码 (可选)
    pub password: Option<String>,
    /// 下载限速 (KB/s, 可选)
    pub download_limit: Option<u32>,
    /// 跳过 TLS 证书验证
    #[serde(default)]
    pub skip_tls_verify: bool,
}

/// 更新仓库请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRegistryRequest {
    /// 仓库 ID
    pub registry_id: String,
    /// 仓库名称 (可选)
    pub name: Option<String>,
    /// 仓库类型 (可选)
    pub registry_type: Option<RegistryType>,
    /// 仓库地址 (可选)
    pub url: Option<String>,
    /// 用户名 (可选)
    pub username: Option<String>,
    /// 密码 (可选)
    pub password: Option<String>,
    /// 下载限速 (KB/s, 可选)
    pub download_limit: Option<u32>,
    /// 跳过 TLS 证书验证 (可选)
    pub skip_tls_verify: Option<bool>,
}

/// 同步仓库镜像请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRegistryRequest {
    /// 仓库 ID
    pub registry_id: String,
    /// 要同步的镜像列表 (如 ["nginx:latest", "redis:7"])
    pub images: Vec<String>,
}

/// 仓库镜像信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryImage {
    /// 镜像名称 (如 library/nginx)
    pub name: String,
    /// 标签列表
    pub tags: Vec<String>,
    /// 镜像大小 (bytes)
    pub size: Option<u64>,
    /// 最后更新时间
    pub last_updated: Option<i64>,
}

/// 同步进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    /// 当前镜像
    pub current_image: String,
    /// 当前进度 (百分比)
    pub progress: f64,
    /// 状态
    pub status: String,
    /// 当前索引
    pub current_index: u32,
    /// 总数
    pub total: u32,
}
