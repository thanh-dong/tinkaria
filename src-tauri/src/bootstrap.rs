use std::env;

use async_nats::{Client, ConnectOptions, Message};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tauri::{
    AppHandle, Builder, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

use crate::logging::{last_error_message, log_event, open_log_file, LogEvent};
use crate::manifest::{
    derive_nats_ws_url, fetch_desktop_companion_manifest, fetch_server_auth_token,
    resolve_legacy_auth_token, resolve_legacy_nats_ws_url, DesktopCompanionManifest,
};
use crate::settings::open_settings_window;
use crate::tray::{
    current_tray_snapshot, setup_tray, update_tray_snapshot, CompanionTraySnapshot, EXIT_MENU_ID,
    OPEN_LOG_FILE_MENU_ID, OPEN_MAIN_SHELL_MENU_ID, OPEN_SETTINGS_MENU_ID,
};
use crate::webview::{close_controlled_webview, open_controlled_webview};

const WEBVIEW_COMMAND_SUBJECT: &str = "kanna.cmd.webview.>";
const DESKTOP_REGISTER_SUBJECT: &str = "kanna.cmd.desktop.register";
const PRIMARY_SHELL_WINDOW_LABEL: &str = "main-shell";
const PRIMARY_SHELL_WINDOW_TITLE: &str = "Tinkaria";

#[derive(Debug, Clone, PartialEq, Eq)]
enum PrimaryShellWindowTransition {
    Open(Url),
    Navigate(Url),
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum DesktopCommand {
    #[serde(rename = "webview.open")]
    Open {
        renderer_id: String,
        webview_id: String,
        target_kind: String,
        target: String,
        dock_state: String,
    },
    #[serde(rename = "webview.close")]
    Close {
        renderer_id: String,
        webview_id: String,
    },
}

pub fn run() {
    Builder::default()
        .invoke_handler(tauri::generate_handler![
            toggle_primary_shell_maximize,
            set_primary_shell_fullscreen
        ])
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_SETTINGS_MENU_ID => {
                if let Err(error) = open_settings_window(app) {
                    log_event(LogEvent::error(
                        "tray",
                        "open_settings",
                        error,
                        [("menuId", json!(OPEN_SETTINGS_MENU_ID))],
                    ));
                }
            }
            OPEN_MAIN_SHELL_MENU_ID => {
                if let Err(error) = reopen_primary_shell_window(app) {
                    log_event(LogEvent::error(
                        "tray",
                        "open_main_shell",
                        error,
                        [("menuId", json!(OPEN_MAIN_SHELL_MENU_ID))],
                    ));
                }
            }
            OPEN_LOG_FILE_MENU_ID => {
                if let Err(error) = open_log_file() {
                    log_event(LogEvent::error(
                        "tray",
                        "open_log_file",
                        error,
                        [("menuId", json!(OPEN_LOG_FILE_MENU_ID))],
                    ));
                }
            }
            EXIT_MENU_ID => {
                log_event(LogEvent::info("tray", "exit", [("menuId", json!(EXIT_MENU_ID))]));
                app.exit(0);
            }
            _ => {}
        })
        .setup(|app| {
            setup_tray(
                &app.handle(),
                {
                    let mut snapshot = CompanionTraySnapshot::new(desktop_renderer_id());
                    snapshot.connection_state = "connecting".to_string();
                    snapshot.server_url = Some("http://127.0.0.1:5174".to_string());
                    snapshot.last_error = last_error_message();
                    snapshot
                },
            )
            .map_err(|error| {
                log_event(LogEvent::error("tray", "setup", error.to_string(), Vec::new()));
                error
            })?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let bootstrap_handle = handle.clone();
                if let Err(error) = run_desktop_bootstrap(bootstrap_handle).await {
                    let tray_error = error.clone();
                    let _ = update_tray_snapshot(&handle, |snapshot| {
                        snapshot.connection_state = "disconnected".to_string();
                        snapshot.last_error = Some(tray_error.clone());
                    });
                    log_event(LogEvent::error(
                        "bootstrap",
                        "run",
                        error,
                        [("rendererId", json!(desktop_renderer_id()))],
                    ));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn run_desktop_bootstrap(app: AppHandle) -> Result<(), String> {
    let _ = update_tray_snapshot(&app, |snapshot| {
        snapshot.connection_state = "connecting".to_string();
        snapshot.last_error = None;
    });
    let manifest = load_desktop_companion_manifest(&app).await?;
    if let Err(error) = open_primary_shell_window(&app, &manifest.server_url) {
        log_event(LogEvent::error(
            "shell",
            "open_primary_window",
            error,
            [
                ("rendererId", json!(desktop_renderer_id())),
                ("serverUrl", json!(manifest.server_url.clone())),
            ],
        ));
    }
    let nats_ws_url = derive_nats_ws_url(&manifest.server_url)?;
    let auth_token = fetch_server_auth_token(&manifest.server_url).await?;
    let _ = update_tray_snapshot(&app, |snapshot| {
        snapshot.server_url = Some(manifest.server_url.clone());
        snapshot.nats_url = Some(nats_ws_url.clone());
        snapshot.connection_state = "connecting".to_string();
        snapshot.last_error = None;
    });
    log_event(LogEvent::info(
        "bootstrap",
        "load_manifest",
        [
            ("serverUrl", json!(manifest.server_url.clone())),
            ("natsUrl", json!(nats_ws_url.clone())),
            ("rendererId", json!(desktop_renderer_id())),
        ],
    ));
    let client = match ConnectOptions::with_token(auth_token.clone())
        .connect(nats_ws_url.clone())
        .await
    {
        Ok(client) => client,
        Err(primary_error) => {
            let primary_message = primary_error.to_string();

            if let Some((legacy_nats_ws_url, legacy_auth_token)) = resolve_legacy_transport(&manifest)
            {
                log_event(LogEvent::info(
                    "bootstrap",
                    "connect_nats_legacy_fallback",
                    [
                        ("failedNatsUrl", json!(nats_ws_url.clone())),
                        ("fallbackNatsUrl", json!(legacy_nats_ws_url.clone())),
                        ("rendererId", json!(desktop_renderer_id())),
                    ],
                ));
                let _ = update_tray_snapshot(&app, |snapshot| {
                    snapshot.nats_url = Some(legacy_nats_ws_url.clone());
                    snapshot.last_error = Some(primary_message.clone());
                });

                ConnectOptions::with_token(legacy_auth_token)
                    .connect(legacy_nats_ws_url.clone())
                    .await
                    .map_err(|legacy_error| {
                        let message = format!(
                            "{primary_message}; legacy fallback failed: {}",
                            legacy_error
                        );
                        let tray_error = message.clone();
                        let _ = update_tray_snapshot(&app, |snapshot| {
                            snapshot.connection_state = "disconnected".to_string();
                            snapshot.last_error = Some(tray_error.clone());
                        });
                        log_event(LogEvent::error(
                            "bootstrap",
                            "connect_nats",
                            message.clone(),
                            [
                                ("natsUrl", json!(legacy_nats_ws_url)),
                                ("rendererId", json!(desktop_renderer_id())),
                            ],
                        ));
                        message
                    })?
            } else {
                let tray_error = primary_message.clone();
                let _ = update_tray_snapshot(&app, |snapshot| {
                    snapshot.connection_state = "disconnected".to_string();
                    snapshot.last_error = Some(tray_error.clone());
                });
                log_event(LogEvent::error(
                    "bootstrap",
                    "connect_nats",
                    primary_message.clone(),
                    [
                        ("natsUrl", json!(nats_ws_url.clone())),
                        ("rendererId", json!(desktop_renderer_id())),
                    ],
                ));
                return Err(primary_message);
            }
        }
    };

    register_desktop_renderer(&app, &client, &manifest).await?;
    let _ = update_tray_snapshot(&app, |snapshot| {
        snapshot.connection_state = "connected".to_string();
        snapshot.last_error = None;
    });

    let mut subscriber = client
        .subscribe(WEBVIEW_COMMAND_SUBJECT)
        .await
        .map_err(|error| error.to_string())?;

    while let Some(message) = subscriber.next().await {
        if let Err(error) = handle_message(&app, &client, message).await {
            log_event(LogEvent::error(
                "bootstrap",
                "handle_command",
                error,
                [("rendererId", json!(desktop_renderer_id()))],
            ));
        }
    }

    Ok(())
}

fn resolve_legacy_transport(manifest: &DesktopCompanionManifest) -> Option<(String, String)> {
    Some((
        resolve_legacy_nats_ws_url(manifest)?,
        resolve_legacy_auth_token(manifest)?,
    ))
}

async fn load_desktop_companion_manifest(
    app: &AppHandle,
) -> Result<DesktopCompanionManifest, String> {
    fetch_desktop_companion_manifest().await.map_err(|http_error| {
        let tray_error = http_error.clone();
        let _ = update_tray_snapshot(app, |snapshot| {
            snapshot.connection_state = "disconnected".to_string();
            snapshot.last_error = Some(tray_error.clone());
        });
        log_event(LogEvent::error(
            "bootstrap",
            "load_manifest_http",
            http_error.clone(),
            [
                ("url", json!("http://127.0.0.1:5174/desktop-companion.json")),
                ("rendererId", json!(desktop_renderer_id())),
            ],
        ));
        http_error
    })
}

async fn register_desktop_renderer(
    app: &AppHandle,
    client: &Client,
    manifest: &DesktopCompanionManifest,
) -> Result<(), String> {
    let renderer_id = desktop_renderer_id();
    let payload = serde_json::to_vec(&serde_json::json!({
        "type": "desktop.register",
        "rendererId": renderer_id,
        "machineName": desktop_machine_name(),
        "capabilities": ["native_webview"],
        "serverUrl": manifest.server_url,
        "natsUrl": derive_nats_ws_url(&manifest.server_url).ok(),
        "lastError": last_error_message(),
    }))
    .map_err(|error| error.to_string())?;

    client
        .request(DESKTOP_REGISTER_SUBJECT.to_string(), payload.into())
        .await
        .map_err(|error| {
            let message = error.to_string();
            let tray_error = message.clone();
            let _ = update_tray_snapshot(app, |snapshot| {
                snapshot.connection_state = "disconnected".to_string();
                snapshot.last_error = Some(tray_error.clone());
            });
            log_event(LogEvent::error(
                "bootstrap",
                "register_renderer",
                message.clone(),
                [("rendererId", json!(desktop_renderer_id()))],
            ));
            message
        })?;

    log_event(LogEvent::info(
        "bootstrap",
        "register_renderer",
        [("rendererId", json!(desktop_renderer_id()))],
    ));

    Ok(())
}

fn desktop_renderer_id() -> String {
    format!("desktop:{}", desktop_machine_name())
}

fn desktop_machine_name() -> String {
    env::var("TINKARIA_DESKTOP_NAME")
        .ok()
        .or_else(|| env::var("COMPUTERNAME").ok())
        .or_else(|| env::var("HOSTNAME").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Desktop Renderer".to_string())
}

pub fn primary_shell_window_label() -> &'static str {
    PRIMARY_SHELL_WINDOW_LABEL
}

pub fn normalize_primary_shell_url(server_url: &str) -> Result<Url, String> {
    let mut url = Url::parse(server_url)
        .map_err(|error| format!("invalid primary shell server url {server_url}: {error}"))?;
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn primary_shell_window_transition(
    server_url: &str,
    window_exists: bool,
) -> Result<PrimaryShellWindowTransition, String> {
    let url = normalize_primary_shell_url(server_url)?;
    Ok(if window_exists {
        PrimaryShellWindowTransition::Navigate(url)
    } else {
        PrimaryShellWindowTransition::Open(url)
    })
}

fn open_primary_shell_window(app: &AppHandle, server_url: &str) -> Result<(), String> {
    match primary_shell_window_transition(
        server_url,
        app.get_webview_window(primary_shell_window_label()).is_some(),
    )? {
        PrimaryShellWindowTransition::Navigate(url) => {
            let window = app
                .get_webview_window(primary_shell_window_label())
                .ok_or_else(|| "primary shell window is unavailable".to_string())?;
            window.navigate(url).map_err(|error| error.to_string())?;
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(())
        }
        PrimaryShellWindowTransition::Open(url) => {
            let window = WebviewWindowBuilder::new(
                app,
                primary_shell_window_label(),
                WebviewUrl::External(url),
            )
            .title(PRIMARY_SHELL_WINDOW_TITLE)
            .decorations(false)
            .resizable(true)
            .maximizable(true)
            .fullscreen(false)
            .visible(true)
            .focused(true)
            .build()
            .map_err(|error| error.to_string())?;

            window.on_window_event(|event| {
                if should_hide_primary_shell_on_close(event) {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                    }
                }
            });
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(())
        }
    }
}

fn should_hide_primary_shell_on_close(event: &WindowEvent) -> bool {
    should_hide_primary_shell_on_close_requested(matches!(event, WindowEvent::CloseRequested { .. }))
}

fn should_hide_primary_shell_on_close_requested(is_close_requested: bool) -> bool {
    is_close_requested
}

fn primary_shell_server_url(app: &AppHandle) -> String {
    current_tray_snapshot(app)
        .ok()
        .and_then(|snapshot| snapshot.server_url)
        .filter(|url| !url.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:5174".to_string())
}

fn reopen_primary_shell_window(app: &AppHandle) -> Result<(), String> {
    let server_url = primary_shell_server_url(app);
    open_primary_shell_window(app, &server_url)
}

fn primary_shell_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(primary_shell_window_label())
        .ok_or_else(|| "primary shell window is unavailable".to_string())
}

#[tauri::command]
pub fn toggle_primary_shell_maximize(app: AppHandle) -> Result<(), String> {
    let window = primary_shell_window(&app)?;
    if window.is_maximized().map_err(|error| error.to_string())? {
        window.unmaximize().map_err(|error| error.to_string())?;
    } else {
        window.maximize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_primary_shell_fullscreen(app: AppHandle, fullscreen: bool) -> Result<(), String> {
    let window = primary_shell_window(&app)?;
    window
        .set_fullscreen(fullscreen)
        .map_err(|error| error.to_string())
}

async fn handle_message(app: &AppHandle, client: &Client, message: Message) -> Result<(), String> {
    let subject = message.subject.to_string();
    let reply = message
        .reply
        .ok_or_else(|| "request missing reply subject".to_string())?;

    let response = match serde_json::from_slice::<DesktopCommand>(&message.payload) {
        Ok(command) => match command {
            DesktopCommand::Open {
                renderer_id,
                webview_id,
                target_kind,
                target,
                dock_state,
            } => {
                if renderer_id != desktop_renderer_id() {
                    return Ok(());
                }
                log_event(LogEvent::info(
                    "webview",
                    "open_request",
                    [
                        ("subject", json!(subject.clone())),
                        ("rendererId", json!(renderer_id.clone())),
                        ("webviewId", json!(webview_id.clone())),
                        ("targetKind", json!(target_kind.clone())),
                        ("target", json!(target.clone())),
                        ("dockState", json!(dock_state.clone())),
                    ],
                ));
                match open_controlled_webview(app, &webview_id, &target) {
                    Ok(()) => serde_json::json!({ "ok": true }),
                    Err(error) => serde_json::json!({
                        "ok": false,
                        "error": error.to_string()
                    }),
                }
            }
            DesktopCommand::Close {
                renderer_id,
                webview_id,
            } => {
                if renderer_id != desktop_renderer_id() {
                    return Ok(());
                }
                log_event(LogEvent::info(
                    "webview",
                    "close_request",
                    [
                        ("subject", json!(subject.clone())),
                        ("rendererId", json!(renderer_id.clone())),
                        ("webviewId", json!(webview_id.clone())),
                    ],
                ));
                match close_controlled_webview(app, &webview_id) {
                    Ok(()) => serde_json::json!({ "ok": true }),
                    Err(error) => serde_json::json!({
                        "ok": false,
                        "error": error.to_string()
                    }),
                }
            }
        },
        Err(error) => serde_json::json!({
            "ok": false,
            "error": format!("invalid command payload: {error}")
        }),
    };

    let payload = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
    client
        .publish(reply, payload.into())
        .await
        .map_err(|error| {
            let message = error.to_string();
            let tray_error = message.clone();
            let _ = update_tray_snapshot(app, |snapshot| {
                snapshot.last_error = Some(tray_error.clone());
            });
            log_event(LogEvent::error(
                "bootstrap",
                "publish_reply",
                message.clone(),
                [("subject", json!(subject)), ("rendererId", json!(desktop_renderer_id()))],
            ));
            message
        })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_primary_shell_url, primary_shell_window_label,
        primary_shell_window_transition, PrimaryShellWindowTransition,
        should_hide_primary_shell_on_close_requested, PRIMARY_SHELL_WINDOW_LABEL,
        PRIMARY_SHELL_WINDOW_TITLE,
    };

    #[test]
    fn primary_shell_window_label_is_stable() {
        assert_eq!(primary_shell_window_label(), PRIMARY_SHELL_WINDOW_LABEL);
        assert_eq!(PRIMARY_SHELL_WINDOW_LABEL, "main-shell");
    }

    #[test]
    fn primary_shell_window_title_uses_tinkaria_branding() {
        assert_eq!(PRIMARY_SHELL_WINDOW_TITLE, "Tinkaria");
    }

    #[test]
    fn primary_shell_url_normalizes_to_the_server_route() {
        let url = normalize_primary_shell_url("http://127.0.0.1:5174/app?query=1#shell")
            .expect("server url should parse");

        assert_eq!(url.as_str(), "http://127.0.0.1:5174/app");
    }

    #[test]
    fn primary_shell_existing_window_refreshes_to_current_server_url() {
        let transition = primary_shell_window_transition(
            "http://127.0.0.1:5174/app?query=1#shell",
            true,
        )
        .expect("server url should parse");

        match transition {
            PrimaryShellWindowTransition::Navigate(url) => {
                assert_eq!(url.as_str(), "http://127.0.0.1:5174/app");
            }
            PrimaryShellWindowTransition::Open(_) => panic!("expected an existing window refresh"),
        }
    }

    #[test]
    fn primary_shell_close_requests_are_hidden_instead_of_exiting() {
        assert!(should_hide_primary_shell_on_close_requested(true));
        assert!(!should_hide_primary_shell_on_close_requested(false));
    }
}
