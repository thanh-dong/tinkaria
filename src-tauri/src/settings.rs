use std::{env, fs, path::PathBuf};

use base64::Engine;
use serde_json::Value;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::logging::{companion_log_path_for_current_runtime, last_error_message};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
pub const SETTINGS_WINDOW_TITLE: &str = "Tinkaria Companion Settings";
const SETTINGS_WINDOW_WIDTH: f64 = 980.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 760.0;
const DEFAULT_DESKTOP_SETTINGS_SERVER_URL: &str = "http://127.0.0.1:5175";

pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let url = settings_window_url(app).or_else(|_| settings_data_url(app))?;

    let window = WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, WebviewUrl::External(url))
        .title(SETTINGS_WINDOW_TITLE)
        .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;

    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn settings_window_url(app: &AppHandle) -> Result<Url, String> {
    let renderer_id = companion_renderer_id();
    let server_url = read_bootstrap_snapshot(app)
        .and_then(|value| value.get("serverUrl").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| DEFAULT_DESKTOP_SETTINGS_SERVER_URL.to_string());

    get_companion_settings_url(&server_url, &renderer_id)
}

fn get_companion_settings_url(server_url: &str, renderer_id: &str) -> Result<Url, String> {
    let mut url = Url::parse(server_url)
        .map_err(|error| format!("invalid companion settings server url {server_url}: {error}"))?;
    url.path_segments_mut()
        .map_err(|_| format!("invalid companion settings server url {server_url}"))?
        .extend(["desktop", renderer_id]);
    Ok(url)
}

fn settings_data_url(app: &AppHandle) -> Result<Url, String> {
    let html = render_settings_document(app)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(html);
    let raw = format!("data:text/html;base64,{encoded}");
    raw.parse::<Url>()
        .map_err(|error| format!("invalid settings data url: {error}"))
}

fn render_settings_document(app: &AppHandle) -> Result<String, String> {
    let snapshot = read_bootstrap_snapshot(app);
    let bootstrap_path = desktop_bootstrap_path(app)?;
    Ok(render_settings_document_from_snapshot(snapshot.as_ref(), &bootstrap_path))
}

fn render_settings_document_from_snapshot(snapshot: Option<&Value>, bootstrap_path: &PathBuf) -> String {
    let server_url = snapshot
        .and_then(|value| value.get("serverUrl"))
        .and_then(Value::as_str)
        .unwrap_or("Unavailable");
    let nats_url = snapshot
        .and_then(|value| value.get("natsUrl"))
        .and_then(Value::as_str)
        .unwrap_or("Unavailable");
    let nats_ws_url = snapshot
        .and_then(|value| value.get("natsWsUrl"))
        .and_then(Value::as_str)
        .unwrap_or("Unavailable");
    let auth_present = snapshot
        .and_then(|value| value.get("authToken"))
        .and_then(Value::as_str)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let log_path = companion_log_path_for_current_runtime()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "Unavailable".to_string());
    let last_error = last_error_message().unwrap_or_else(|| "None".to_string());
    let renderer_id = companion_renderer_id();
    let attach_state = if snapshot.is_some() { "Bootstrap loaded" } else { "Bootstrap missing" };

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #fff8ee;
        --panel: rgba(255, 255, 255, 0.88);
        --ink: #17322c;
        --muted: #5e6c66;
        --accent: #ff8a5b;
        --line: rgba(23, 50, 44, 0.12);
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "Inter", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(255, 138, 91, 0.18), transparent 32%),
          linear-gradient(180deg, #fffaf2 0%, var(--bg) 100%);
      }}
      main {{
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 28px 56px;
      }}
      .hero {{
        display: grid;
        gap: 14px;
        margin-bottom: 28px;
      }}
      .eyebrow {{
        display: inline-flex;
        width: fit-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255, 138, 91, 0.14);
        color: #8c4b2f;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}
      h1 {{
        margin: 0;
        font-size: 34px;
        line-height: 1.05;
      }}
      p {{
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
        max-width: 760px;
      }}
      .grid {{
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }}
      .card {{
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 10px 30px rgba(23, 50, 44, 0.06);
      }}
      .card h2 {{
        margin: 0 0 10px;
        font-size: 16px;
      }}
      .value {{
        font-size: 14px;
        line-height: 1.45;
        color: var(--ink);
        word-break: break-word;
      }}
      .muted {{
        color: var(--muted);
      }}
      .status {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }}
      .dot {{
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: {status_color};
        box-shadow: 0 0 0 5px {status_glow};
      }}
      .note {{
        margin-top: 24px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px dashed rgba(23, 50, 44, 0.18);
        background: rgba(255, 255, 255, 0.55);
      }}
      code {{
        font-family: "SFMono-Regular", "Consolas", monospace;
        font-size: 13px;
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">Tinkaria Companion</span>
        <h1>Native companion settings</h1>
        <p>
          This window is local to the Tauri companion. It stays usable even when the browser app
          cannot attach over NATS WebSocket from Windows. Use it to inspect the current bootstrap
          contract and companion identity without depending on the main frontend transport.
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Attach status</h2>
          <div class="status"><span class="dot"></span><span>{attach_state}</span></div>
          <p class="muted" style="margin-top: 10px;">Auth token present: {auth_present}</p>
        </article>
        <article class="card">
          <h2>Renderer identity</h2>
          <div class="value"><code>{renderer_id}</code></div>
        </article>
        <article class="card">
          <h2>Main server</h2>
          <div class="value"><code>{server_url}</code></div>
        </article>
        <article class="card">
          <h2>NATS TCP</h2>
          <div class="value"><code>{nats_url}</code></div>
        </article>
        <article class="card">
          <h2>NATS WebSocket</h2>
          <div class="value"><code>{nats_ws_url}</code></div>
        </article>
        <article class="card">
          <h2>Bootstrap file</h2>
          <div class="value"><code>{bootstrap_path}</code></div>
        </article>
        <article class="card">
          <h2>Companion log</h2>
          <div class="value"><code>{log_path}</code></div>
        </article>
        <article class="card">
          <h2>Last error</h2>
          <div class="value"><code>{last_error}</code></div>
        </article>
      </section>

      <section class="note">
        <strong>Why this page is local:</strong>
        <span class="muted">
          the companion settings window no longer loads <code>/settings/general</code> from the browser app,
          because that route depends on browser-side NATS WebSocket connectivity that is not currently reachable
          from the Windows companion environment.
        </span>
      </section>
    </main>
  </body>
</html>"#,
        title = SETTINGS_WINDOW_TITLE,
        attach_state = escape_html(attach_state),
        auth_present = if auth_present { "yes" } else { "no" },
        renderer_id = escape_html(&renderer_id),
        server_url = escape_html(server_url),
        nats_url = escape_html(nats_url),
        nats_ws_url = escape_html(nats_ws_url),
        bootstrap_path = escape_html(&bootstrap_path.display().to_string()),
        log_path = escape_html(&log_path),
        last_error = escape_html(&last_error),
        status_color = if snapshot.is_some() { "#2f9e6f" } else { "#c96a43" },
        status_glow = if snapshot.is_some() {
            "rgba(47, 158, 111, 0.16)"
        } else {
            "rgba(201, 106, 67, 0.16)"
        },
    )
}

fn read_bootstrap_snapshot(app: &AppHandle) -> Option<Value> {
    let path = desktop_bootstrap_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn desktop_bootstrap_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("failed to resolve home dir: {error}"))?;

    Ok(home_dir
        .join(runtime_data_root_name())
        .join("data")
        .join("desktop-bootstrap.json"))
}

fn runtime_data_root_name() -> &'static str {
    let profile = env::var("TINKARIA_RUNTIME_PROFILE")
        .ok()
        .or_else(|| env::var("KANNA_RUNTIME_PROFILE").ok())
        .unwrap_or_default();

    if profile.trim().eq_ignore_ascii_case("dev") {
        ".tinkaria-dev"
    } else {
        ".tinkaria"
    }
}

fn companion_renderer_id() -> String {
    let machine_name = env::var("TINKARIA_DESKTOP_NAME")
        .ok()
        .or_else(|| env::var("COMPUTERNAME").ok())
        .or_else(|| env::var("HOSTNAME").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Desktop Renderer".to_string());
    format!("desktop:{machine_name}")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::{
        escape_html, get_companion_settings_url, render_settings_document_from_snapshot,
        SETTINGS_WINDOW_HEIGHT, SETTINGS_WINDOW_TITLE, SETTINGS_WINDOW_WIDTH,
    };
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn companion_settings_route_targets_a_specific_renderer() {
        let url = get_companion_settings_url("http://127.0.0.1:5175", "desktop:LAGZ0NE")
            .expect("desktop settings url should parse");

        assert_eq!(url.as_str(), "http://127.0.0.1:5175/desktop/desktop:LAGZ0NE");
    }

    #[test]
    fn settings_window_supports_data_urls() {
        let cargo_toml = include_str!("../Cargo.toml");

        assert!(cargo_toml.contains("\"webview-data-url\""));
    }

    #[test]
    fn settings_window_document_is_local_and_branded() {
        let html = render_settings_document_from_snapshot(
            Some(&json!({
                "serverUrl": "http://127.0.0.1:5174",
                "natsUrl": "nats://127.0.0.1:4222",
                "natsWsUrl": "ws://127.0.0.1:4223",
                "authToken": "secret",
            })),
            &PathBuf::from("/tmp/.tinkaria-dev/data/desktop-bootstrap.json"),
        );

        assert!(html.contains("Tinkaria Companion"));
        assert!(html.contains("Native companion settings"));
        assert!(html.contains("no longer loads <code>/settings/general</code>"));
        assert!(html.contains("http://127.0.0.1:5174"));
        assert!(html.contains("Companion log"));
        assert!(html.contains("Last error"));
    }

    #[test]
    fn settings_window_title_uses_tinkaria_branding() {
        assert_eq!(SETTINGS_WINDOW_TITLE, "Tinkaria Companion Settings");
    }

    #[test]
    fn settings_window_size_is_stable() {
        assert_eq!(SETTINGS_WINDOW_WIDTH, 980.0);
        assert_eq!(SETTINGS_WINDOW_HEIGHT, 760.0);
    }

    #[test]
    fn escapes_html_values() {
        assert_eq!(escape_html("<tag>&\""), "&lt;tag&gt;&amp;&quot;");
    }
}
