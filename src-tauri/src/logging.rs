use serde_json::{Map, Value};

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
    eprintln!("{}", format_log_event(&event));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
