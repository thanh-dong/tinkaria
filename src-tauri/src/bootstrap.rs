use std::env;

use async_nats::{Client, ConnectOptions, Message};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Builder};

use crate::logging::{last_error_message, log_event, open_log_file, LogEvent};
use crate::manifest::{
    derive_nats_ws_url, fetch_desktop_companion_manifest, fetch_server_auth_token,
    resolve_legacy_auth_token, resolve_legacy_nats_ws_url, DesktopCompanionManifest,
};
use crate::settings::open_settings_window;
use crate::tray::{
    setup_tray, update_tray_snapshot, CompanionTraySnapshot, EXIT_MENU_ID, OPEN_LOG_FILE_MENU_ID,
    OPEN_SETTINGS_MENU_ID,
};
use crate::webview::{close_controlled_webview, open_controlled_webview};

const WEBVIEW_COMMAND_SUBJECT: &str = "kanna.cmd.webview.>";
const DESKTOP_REGISTER_SUBJECT: &str = "kanna.cmd.desktop.register";

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
