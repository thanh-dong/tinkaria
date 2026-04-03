use std::sync::Mutex;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub const COMPANION_TRAY_ID: &str = "companion";
pub const STATUS_MENU_ID: &str = "status";
pub const SERVER_MENU_ID: &str = "server";
pub const NATS_MENU_ID: &str = "nats";
pub const RENDERER_MENU_ID: &str = "renderer";
pub const ERROR_MENU_ID: &str = "last-error";
pub const OPEN_MAIN_SHELL_MENU_ID: &str = "open-main-shell";
pub const OPEN_SETTINGS_MENU_ID: &str = "open-settings";
pub const OPEN_LOG_FILE_MENU_ID: &str = "open-log-file";
pub const EXIT_MENU_ID: &str = "exit";
pub const COMPANION_TOOLTIP: &str = "Tinkaria Companion";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompanionTraySnapshot {
    pub connection_state: String,
    pub server_url: Option<String>,
    pub nats_url: Option<String>,
    pub renderer_id: String,
    pub last_error: Option<String>,
}

impl CompanionTraySnapshot {
    pub fn new(renderer_id: impl Into<String>) -> Self {
        Self {
            connection_state: "disconnected".to_string(),
            server_url: None,
            nats_url: None,
            renderer_id: renderer_id.into(),
            last_error: None,
        }
    }
}

pub fn setup_tray(app: &AppHandle, snapshot: CompanionTraySnapshot) -> tauri::Result<()> {
    if app.try_state::<Mutex<CompanionTraySnapshot>>().is_none() {
        app.manage(Mutex::new(snapshot.clone()));
    }

    if app.tray_by_id(COMPANION_TRAY_ID).is_some() {
        return refresh_tray(app);
    }

    let menu = build_tray_menu(app, &snapshot)?;

    let mut tray = TrayIconBuilder::with_id(COMPANION_TRAY_ID)
        .menu(&menu)
        .tooltip(COMPANION_TOOLTIP)
        .show_menu_on_left_click(true);

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

pub fn update_tray_snapshot(
    app: &AppHandle,
    update: impl FnOnce(&mut CompanionTraySnapshot),
) -> Result<(), String> {
    let state = app
        .try_state::<Mutex<CompanionTraySnapshot>>()
        .ok_or_else(|| "tray state not initialized".to_string())?;
    {
        let mut snapshot = state.lock().map_err(|error| error.to_string())?;
        update(&mut snapshot);
    }
    refresh_tray(app).map_err(|error| error.to_string())
}

pub fn current_tray_snapshot(app: &AppHandle) -> Result<CompanionTraySnapshot, String> {
    let state = app
        .try_state::<Mutex<CompanionTraySnapshot>>()
        .ok_or_else(|| "tray state not initialized".to_string())?;

    state
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|error| error.to_string())
}

pub fn refresh_tray(app: &AppHandle) -> tauri::Result<()> {
    let state = app
        .try_state::<Mutex<CompanionTraySnapshot>>()
        .ok_or_else(|| tauri::Error::AssetNotFound("tray state not initialized".to_string()))?;
    let snapshot = state
        .lock()
        .map_err(|_| tauri::Error::AssetNotFound("tray state lock poisoned".to_string()))?
        .clone();

    if let Some(tray) = app.tray_by_id(COMPANION_TRAY_ID) {
        let menu = build_tray_menu(app, &snapshot)?;
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

fn build_tray_menu(
    app: &AppHandle,
    snapshot: &CompanionTraySnapshot,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let status = MenuItemBuilder::with_id(STATUS_MENU_ID, format_status_label(&snapshot.connection_state))
        .enabled(false)
        .build(app)?;
    let server = MenuItemBuilder::with_id(SERVER_MENU_ID, format_server_label(snapshot.server_url.as_deref()))
        .enabled(false)
        .build(app)?;
    let nats = MenuItemBuilder::with_id(NATS_MENU_ID, format_nats_label(snapshot.nats_url.as_deref()))
        .enabled(false)
        .build(app)?;
    let renderer = MenuItemBuilder::with_id(RENDERER_MENU_ID, format_renderer_label(&snapshot.renderer_id))
        .enabled(false)
        .build(app)?;
    let error = MenuItemBuilder::with_id(ERROR_MENU_ID, format_error_label(snapshot.last_error.as_deref()))
        .enabled(false)
        .build(app)?;

    MenuBuilder::new(app)
        .item(&status)
        .item(&server)
        .item(&nats)
        .item(&renderer)
        .item(&error)
        .separator()
        .text(OPEN_MAIN_SHELL_MENU_ID, "Open Tinkaria")
        .text(OPEN_SETTINGS_MENU_ID, "Open Settings")
        .text(OPEN_LOG_FILE_MENU_ID, "Open Log File")
        .separator()
        .text(EXIT_MENU_ID, "Exit")
        .build()
}

pub fn format_status_label(state: &str) -> String {
    let status = match state {
        "connected" => "Connected",
        "connecting" => "Connecting",
        _ => "Disconnected",
    };
    format!("Status: {status}")
}

pub fn format_server_label(server_url: Option<&str>) -> String {
    format!("Server: {}", server_url.unwrap_or("unavailable"))
}

pub fn format_nats_label(nats_url: Option<&str>) -> String {
    format!("NATS: {}", nats_url.unwrap_or("unavailable"))
}

pub fn format_renderer_label(renderer_id: &str) -> String {
    format!("Renderer: {renderer_id}")
}

pub fn format_error_label(error: Option<&str>) -> String {
    let message = error.unwrap_or("none");
    let compact = if message.chars().count() > 72 {
        let truncated: String = message.chars().take(69).collect();
        format!("{truncated}...")
    } else {
        message.to_string()
    };
    format!("Last error: {compact}")
}

#[cfg(test)]
mod tests {
    use super::{
        format_error_label, format_nats_label, format_renderer_label, format_server_label,
        format_status_label, CompanionTraySnapshot, COMPANION_TOOLTIP, ERROR_MENU_ID,
        OPEN_LOG_FILE_MENU_ID, OPEN_MAIN_SHELL_MENU_ID, RENDERER_MENU_ID, SERVER_MENU_ID,
        STATUS_MENU_ID,
    };

    #[test]
    fn tray_tooltip_uses_tinkaria_branding() {
        assert_eq!(COMPANION_TOOLTIP, "Tinkaria Companion");
    }

    #[test]
    fn tray_status_label_reflects_connection_state() {
        assert_eq!(format_status_label("connecting"), "Status: Connecting");
        assert_eq!(format_status_label("connected"), "Status: Connected");
        assert_eq!(format_status_label("disconnected"), "Status: Disconnected");
    }

    #[test]
    fn tray_info_labels_surface_targets() {
        assert_eq!(
            format_server_label(Some("http://127.0.0.1:5174")),
            "Server: http://127.0.0.1:5174"
        );
        assert_eq!(format_server_label(None), "Server: unavailable");
        assert_eq!(
            format_nats_label(Some("nats://127.0.0.1:4222")),
            "NATS: nats://127.0.0.1:4222"
        );
        assert_eq!(
            format_renderer_label("desktop:DEVBOX"),
            "Renderer: desktop:DEVBOX"
        );
    }

    #[test]
    fn tray_menu_ids_cover_diagnostics_surfaces() {
        assert_eq!(STATUS_MENU_ID, "status");
        assert_eq!(SERVER_MENU_ID, "server");
        assert_eq!(RENDERER_MENU_ID, "renderer");
        assert_eq!(ERROR_MENU_ID, "last-error");
        assert_eq!(OPEN_MAIN_SHELL_MENU_ID, "open-main-shell");
        assert_eq!(OPEN_LOG_FILE_MENU_ID, "open-log-file");
    }

    #[test]
    fn tray_error_label_truncates_long_messages() {
        let label = format_error_label(Some(
            "connect_nats failed for renderer desktop:DEVBOX because the endpoint was unreachable for too long",
        ));

        assert!(label.starts_with("Last error: connect_nats failed"));
        assert!(label.ends_with("..."));
    }

    #[test]
    fn tray_snapshot_defaults_to_disconnected() {
        let snapshot = CompanionTraySnapshot::new("desktop:DEVBOX");

        assert_eq!(snapshot.connection_state, "disconnected");
        assert_eq!(snapshot.server_url, None);
        assert_eq!(snapshot.nats_url, None);
        assert_eq!(snapshot.renderer_id, "desktop:DEVBOX");
        assert_eq!(snapshot.last_error, None);
    }
}
