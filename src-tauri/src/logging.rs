use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde_json::{Map, Value};

static LAST_ERROR: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogEvent {
    pub component: &'static str,
    pub action: &'static str,
    pub status: &'static str,
    pub context: Map<String, Value>,
    pub error: Option<String>,
}

impl LogEvent {
    pub fn info(
        component: &'static str,
        action: &'static str,
        context: impl IntoIterator<Item = (&'static str, Value)>,
    ) -> Self {
        Self {
            component,
            action,
            status: "ok",
            context: context.into_iter().map(|(key, value)| (key.to_string(), value)).collect(),
            error: None,
        }
    }

    pub fn error(
        component: &'static str,
        action: &'static str,
        error: impl Into<String>,
        context: impl IntoIterator<Item = (&'static str, Value)>,
    ) -> Self {
        Self {
            component,
            action,
            status: "error",
            context: context.into_iter().map(|(key, value)| (key.to_string(), value)).collect(),
            error: Some(error.into()),
        }
    }
}

pub fn format_log_event(event: &LogEvent) -> String {
    let mut payload = Map::new();
    payload.insert("component".to_string(), Value::String(event.component.to_string()));
    payload.insert("action".to_string(), Value::String(event.action.to_string()));
    payload.insert("status".to_string(), Value::String(event.status.to_string()));
    payload.insert("context".to_string(), Value::Object(event.context.clone()));
    if let Some(error) = &event.error {
        payload.insert("error".to_string(), Value::String(error.clone()));
    }

    format!("[tinkaria-companion] {}", Value::Object(payload))
}

pub fn log_event(event: LogEvent) {
    let formatted = format_log_event(&event);
    if let Some(error) = event.error.as_deref() {
        remember_last_error(error);
    }
    persist_log_line(&formatted);
    eprintln!("{formatted}");
}

pub fn companion_log_path_for_current_runtime() -> Result<PathBuf, String> {
    let home_dir = runtime_home_dir()?;
    Ok(companion_log_path(&home_dir, is_dev_runtime()))
}

pub fn open_log_file() -> Result<PathBuf, String> {
    let log_path = companion_log_path_for_current_runtime()?;
    ensure_log_file_exists(&log_path)?;

    let status = if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &log_path.display().to_string()])
            .status()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(&log_path).status()
    } else {
        std::process::Command::new("xdg-open").arg(&log_path).status()
    }
    .map_err(|error| format!("failed to open {}: {error}", log_path.display()))?;

    if !status.success() {
        return Err(format!(
            "failed to open {}: command exited with {status}",
            log_path.display()
        ));
    }

    Ok(log_path)
}

pub fn last_error_message() -> Option<String> {
    LAST_ERROR
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|value| value.clone())
}

fn runtime_home_dir() -> Result<PathBuf, String> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "failed to resolve runtime home directory".to_string())
}

fn persist_log_line(line: &str) {
    let Ok(log_path) = companion_log_path_for_current_runtime() else {
        return;
    };

    if ensure_log_file_exists(&log_path).is_err() {
        return;
    }

    let existing = fs::read_to_string(&log_path).unwrap_or_default();
    let mut next = String::with_capacity(existing.len() + line.len() + 1);
    next.push_str(&existing);
    if !existing.is_empty() && !existing.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(line);
    next.push('\n');
    let _ = fs::write(&log_path, next);
}

fn ensure_log_file_exists(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("failed to resolve parent for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    if !path.exists() {
        fs::write(path, "").map_err(|error| format!("failed to create {}: {error}", path.display()))?;
    }
    Ok(())
}

fn is_dev_runtime() -> bool {
    env::var("TINKARIA_RUNTIME_PROFILE")
        .ok()
        .or_else(|| env::var("KANNA_RUNTIME_PROFILE").ok())
        .unwrap_or_default()
        .trim()
        .eq_ignore_ascii_case("dev")
}

pub(crate) fn companion_log_path(home_dir: impl AsRef<Path>, is_dev: bool) -> PathBuf {
    home_dir
        .as_ref()
        .join(if is_dev { ".tinkaria-dev" } else { ".tinkaria" })
        .join("logs")
        .join("companion.log")
}

pub(crate) fn remember_last_error(error: impl Into<String>) {
    if let Ok(mut slot) = LAST_ERROR.get_or_init(|| Mutex::new(None)).lock() {
        *slot = Some(error.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn formats_error_events_with_component_action_status_context_and_error() {
        let formatted = format_log_event(&LogEvent::error(
            "bootstrap",
            "connect_nats",
            "connection refused",
            [("natsUrl", json!("nats://127.0.0.1:4222")), ("rendererId", json!("desktop:DEV"))],
        ));

        assert!(formatted.starts_with("[tinkaria-companion] {"));
        assert!(formatted.contains("\"component\":\"bootstrap\""));
        assert!(formatted.contains("\"action\":\"connect_nats\""));
        assert!(formatted.contains("\"status\":\"error\""));
        assert!(formatted.contains("\"natsUrl\":\"nats://127.0.0.1:4222\""));
        assert!(formatted.contains("\"rendererId\":\"desktop:DEV\""));
        assert!(formatted.contains("\"error\":\"connection refused\""));
    }

    #[test]
    fn log_file_path_uses_tinkaria_runtime_root() {
        let path = companion_log_path("C:/Users/duc", true);

        assert_eq!(
            path,
            Path::new("C:/Users/duc")
                .join(".tinkaria-dev")
                .join("logs")
                .join("companion.log")
        );
    }

    #[test]
    fn remembers_last_error_message() {
        remember_last_error("connect failed");

        assert_eq!(last_error_message().as_deref(), Some("connect failed"));
    }
}
