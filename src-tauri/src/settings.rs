use std::{env, thread, time::Duration};

use base64::Engine;
use tauri::{
    webview::PageLoadEvent, AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

use crate::logging::{companion_log_path_for_current_runtime, last_error_message, log_event, LogEvent};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
pub const SETTINGS_WINDOW_TITLE: &str = "Tinkaria Companion Settings";
const SETTINGS_WINDOW_WIDTH: f64 = 980.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 760.0;
const DEFAULT_DESKTOP_SETTINGS_SERVER_URL: &str = "http://127.0.0.1:5174";

pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let fallback_url = settings_data_url(app)?;
    let url = settings_window_url(app).unwrap_or_else(|_| fallback_url.clone());
    let fallback_url_for_probe = fallback_url.clone();
    let probe_script = build_settings_fallback_probe_script();

    let window = WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, WebviewUrl::External(url))
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            let loaded_url = payload.url().to_string();
            log_event(LogEvent::info(
                "settings",
                "page_load_finished",
                [("url", serde_json::json!(loaded_url.clone()))],
            ));

            if payload.url().scheme() == "data" {
                return;
            }

            if let Err(error) = window.eval(&probe_script) {
                log_event(LogEvent::error(
                    "settings",
                    "inject_fallback_probe",
                    error.to_string(),
                    [("url", serde_json::json!(loaded_url))],
                ));
                return;
            }

            let window_for_probe = window.clone();
            let fallback_url = fallback_url_for_probe.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(1800));
                let Ok(current_url) = window_for_probe.url() else {
                    log_event(LogEvent::error(
                        "settings",
                        "probe_read_url",
                        "failed to read settings window URL after probe",
                        Vec::new(),
                    ));
                    return;
                };

                let current_url_text = current_url.to_string();
                if current_url_text.contains("#__settings_ready") {
                    log_event(LogEvent::info(
                        "settings",
                        "probe_ready",
                        [("url", serde_json::json!(current_url_text))],
                    ));
                    return;
                }

                if !current_url_text.contains("#__settings_empty") {
                    log_event(LogEvent::info(
                        "settings",
                        "probe_inconclusive",
                        [("url", serde_json::json!(current_url_text))],
                    ));
                    return;
                }

                if let Err(error) = window_for_probe.navigate(fallback_url.clone()) {
                    log_event(LogEvent::error(
                        "settings",
                        "probe_fallback_navigate",
                        error.to_string(),
                        [
                            ("url", serde_json::json!(current_url_text)),
                            ("fallbackUrl", serde_json::json!(fallback_url.to_string())),
                        ],
                    ));
                    return;
                }

                log_event(LogEvent::info(
                    "settings",
                    "probe_fallback_navigate",
                    [
                        ("url", serde_json::json!(current_url_text)),
                        ("fallbackUrl", serde_json::json!(fallback_url.to_string())),
                    ],
                ));
            });
        })
        .title(SETTINGS_WINDOW_TITLE)
        .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;

    window.on_window_event(|event| {
        if should_hide_on_close(event) {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        }
    });

    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn should_hide_on_close(event: &WindowEvent) -> bool {
    should_hide_on_close_requested(matches!(event, WindowEvent::CloseRequested { .. }))
}

fn should_hide_on_close_requested(is_close_requested: bool) -> bool {
    is_close_requested
}

fn settings_window_url(_app: &AppHandle) -> Result<Url, String> {
    let renderer_id = companion_renderer_id();
    let server_url = resolve_settings_server_url();

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

fn build_settings_fallback_probe_script() -> String {
    format!(
        r#"
setTimeout(() => {{
  const text = (document.body?.innerText ?? "").trim();
  const root = document.getElementById("root");
  const hasMeaningfulContent = text.length > 24 || ((root?.childElementCount ?? 0) > 0);
  if (hasMeaningfulContent) {{
    window.location.hash = "__settings_ready";
    return;
  }}
  window.location.hash = "__settings_empty";
}}, 1200);
"#
    )
}

fn render_settings_document(_app: &AppHandle) -> Result<String, String> {
    Ok(render_settings_document_from_server_url(&resolve_settings_server_url()))
}

fn render_settings_document_from_server_url(server_url: &str) -> String {
    let log_path = companion_log_path_for_current_runtime()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "Unavailable".to_string());
    let last_error = last_error_message().unwrap_or_else(|| "None".to_string());
    let renderer_id = companion_renderer_id();
    let attach_state = "Server-target attach";

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
          This window is local to the Tauri companion. It stays usable even when the server-hosted
          desktop route is unavailable. Use it to inspect the current bootstrap contract and
          companion identity without depending on the main frontend surface.
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Attach status</h2>
          <div class="status"><span class="dot"></span><span>{attach_state}</span></div>
          <p class="muted" style="margin-top: 10px;">Auth and NATS transport are resolved from the server at runtime.</p>
        </article>
        <article class="card">
          <h2>Renderer identity</h2>
          <div class="value"><code>{renderer_id}</code></div>
        </article>
        <article class="card">
          <h2>Server target</h2>
          <div class="value"><code>{server_url}</code></div>
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
          the companion prefers the server-hosted <code>/desktop/&lt;rendererId&gt;</code> route, but this
          fallback remains available when the running Tinkaria server cannot serve that page. It no longer
          depends on a local bootstrap file.
        </span>
      </section>
    </main>
  </body>
</html>"#,
        title = SETTINGS_WINDOW_TITLE,
        attach_state = escape_html(attach_state),
        renderer_id = escape_html(&renderer_id),
        server_url = escape_html(server_url),
        log_path = escape_html(&log_path),
        last_error = escape_html(&last_error),
        status_color = if server_url != "Unavailable" { "#2f9e6f" } else { "#c96a43" },
        status_glow = if server_url != "Unavailable" {
            "rgba(47, 158, 111, 0.16)"
        } else {
            "rgba(201, 106, 67, 0.16)"
        },
    )
}

fn resolve_settings_server_url() -> String {
    env::var("TINKARIA_DESKTOP_SERVER_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_DESKTOP_SETTINGS_SERVER_URL.to_string())
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
        build_settings_fallback_probe_script, escape_html,
        get_companion_settings_url, render_settings_document_from_server_url,
        should_hide_on_close_requested, SETTINGS_WINDOW_HEIGHT, SETTINGS_WINDOW_TITLE,
        SETTINGS_WINDOW_WIDTH,
    };

    #[test]
    fn companion_settings_route_targets_a_specific_renderer() {
        let url = get_companion_settings_url("http://127.0.0.1:5174", "desktop:LAGZ0NE")
            .expect("desktop settings url should parse");

        assert_eq!(url.as_str(), "http://127.0.0.1:5174/desktop/desktop:LAGZ0NE");
    }

    #[test]
    fn settings_window_supports_data_urls() {
        let cargo_toml = include_str!("../Cargo.toml");

        assert!(cargo_toml.contains("\"webview-data-url\""));
    }

    #[test]
    fn settings_window_document_is_local_and_branded() {
        let html = render_settings_document_from_server_url("http://127.0.0.1:5174");

        assert!(html.contains("Tinkaria Companion"));
        assert!(html.contains("Native companion settings"));
        assert!(html.contains("server-hosted <code>/desktop/&lt;rendererId&gt;</code> route"));
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

    #[test]
    fn settings_window_probe_falls_back_to_local_page_when_server_page_stays_blank() {
        let script = build_settings_fallback_probe_script();

        assert!(script.contains("setTimeout(() => {"));
        assert!(script.contains("document.body?.innerText"));
        assert!(script.contains("window.location.hash = \"__settings_ready\""));
        assert!(script.contains("window.location.hash = \"__settings_empty\""));
    }

    #[test]
    fn settings_window_close_requests_are_hidden_instead_of_exiting() {
        assert!(should_hide_on_close_requested(true));
        assert!(!should_hide_on_close_requested(false));
    }
}
