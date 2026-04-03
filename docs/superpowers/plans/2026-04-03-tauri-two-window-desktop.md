# Tauri Two-Window Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native two-window Tinkaria desktop runtime: a borderless primary shell for the main chat app plus a managed review window for preview, inspection, viewport switching, and responsive verification.

**Architecture:** Keep the Bun/Vite app as the source of truth and browser-hosted UI surface. Tauri owns native lifecycle and windows: one borderless primary shell pointed at the main app route, and one managed review window controlled over NATS. Before promoting the main shell, fix the public desktop attach path so Windows can connect through the public server origin instead of any WSL-local bootstrap file or random embedded NATS port.

**Tech Stack:** Bun, Vite, React 19, Tauri v2, Rust, async-nats, NATS, Bun test, Cargo test/check, agent-browser

---

### Task 1: Fix Public Desktop Attach Before Window Promotion

**Files:**
- Modify: `src/server/server.ts`
- Modify: `vite.config.ts`
- Modify: `src-tauri/src/manifest.rs`
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src/shared/desktop-companion.ts`
- Modify: `src/shared/desktop-companion.test.ts`
- Test: `src/shared/desktop-companion.test.ts`
- Test: `src-tauri/src/manifest.rs`

- [ ] **Step 1: Write the failing tests for the public attach contract**

```ts
import { describe, expect, test } from "bun:test"
import { createDesktopCompanionManifest, resolveDesktopCompanionServerUrl } from "../server/server"

describe("resolveDesktopCompanionServerUrl", () => {
  test("prefers the configured public origin over the backend bind port", () => {
    process.env.TINKARIA_PUBLIC_SERVER_URL = "http://127.0.0.1:5174"
    expect(resolveDesktopCompanionServerUrl("127.0.0.1", 5175)).toBe("http://127.0.0.1:5174")
    delete process.env.TINKARIA_PUBLIC_SERVER_URL
  })
})

describe("createDesktopCompanionManifest", () => {
  test("keeps only the public companion fields in the normalized contract", () => {
    expect(
      createDesktopCompanionManifest({
        serverUrl: "http://127.0.0.1:5174",
        appName: "Tinkaria",
        version: "1.0.0-rc",
      }),
    ).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      appName: "Tinkaria",
      version: "1.0.0-rc",
    })
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run: `bun test src/shared/desktop-companion.test.ts`  
Expected: FAIL if the server still prefers the backend bind origin or if the public contract is inconsistent.

- [ ] **Step 3: Implement the public-origin manifest and defensive runtime normalization**

```ts
export function resolveDesktopCompanionServerUrl(hostname: string, port: number) {
  const configured = process.env.TINKARIA_PUBLIC_SERVER_URL?.trim()
    || process.env.KANNA_PUBLIC_SERVER_URL?.trim()

  if (configured) {
    return configured
  }

  return `http://${hostname}:${port}`
}
```

```rust
pub fn derive_server_url_from_manifest_url(manifest_url: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(manifest_url)
        .map_err(|error| format!("invalid companion manifest url {manifest_url}: {error}"))?;
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string().trim_end_matches('/').to_string())
}
```

```rust
let manifest = fetch_desktop_companion_manifest().await?;
let nats_ws_url = derive_nats_ws_url(&manifest.server_url)?;
let auth_token = fetch_server_auth_token(&manifest.server_url).await?;
```

- [ ] **Step 4: Make the dev launcher publish the public desktop origin**

```ts
const clientEnv = {
  ...process.env,
  KANNA_DEV_ALLOWED_HOSTS: typeof devArgs.allowedHosts === "boolean"
    ? String(devArgs.allowedHosts)
    : JSON.stringify(devArgs.allowedHosts),
  KANNA_DEV_BACKEND_TARGET_HOST: devArgs.backendTargetHost,
  KANNA_DEV_BACKEND_PORT: String(serverPort),
  TINKARIA_PUBLIC_SERVER_URL: `http://127.0.0.1:${clientPort}`,
}
```

- [ ] **Step 5: Verify the tests pass**

Run: `bun test src/shared/desktop-companion.test.ts`  
Expected: PASS

- [ ] **Step 6: Prove the public `/nats-ws` path from the running dev server**

Run: `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' http://127.0.0.1:5174/nats-ws`  
Expected: `HTTP/1.1 101 Switching Protocols`

- [ ] **Step 7: Commit**

```bash
git add src/server/server.ts vite.config.ts src-tauri/src/manifest.rs src-tauri/src/bootstrap.rs src/shared/desktop-companion.ts src/shared/desktop-companion.test.ts scripts/dev.ts
git commit -m "fix: route desktop attach through public server origin"
```

### Task 2: Promote Tauri To A Borderless Primary Shell

**Files:**
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/settings.rs`
- Modify: `src-tauri/tauri.conf.json`
- Test: `src-tauri/src/settings.rs`

- [ ] **Step 1: Write the failing native-window tests for the primary shell route**

```rust
#[test]
fn companion_settings_route_targets_a_specific_renderer() {
    let url = get_companion_settings_url("http://127.0.0.1:5174", "desktop:LAGZ0NE")
        .expect("desktop settings url should parse");

    assert_eq!(url.as_str(), "http://127.0.0.1:5174/desktop/desktop:LAGZ0NE");
}
```

```rust
#[test]
fn settings_window_document_is_local_and_branded() {
    let html = render_settings_document_from_server_url("http://127.0.0.1:5174");

    assert!(html.contains("Tinkaria Companion"));
    assert!(html.contains("Native companion settings"));
}
```

- [ ] **Step 2: Run the focused native tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings::tests::companion_settings_route_targets_a_specific_renderer --target-dir /tmp/tinkaria-tauri-target`  
Expected: PASS on the current route helper before shell changes begin.

- [ ] **Step 3: Add a primary borderless shell window in Tauri startup**

```rust
const PRIMARY_WINDOW_LABEL: &str = "main-shell";

fn open_primary_shell_window(app: &AppHandle, server_url: &str) -> Result<(), String> {
    let url = Url::parse(server_url).map_err(|error| error.to_string())?;

    tauri::WebviewWindowBuilder::new(app, PRIMARY_WINDOW_LABEL, tauri::WebviewUrl::External(url))
        .title("Tinkaria")
        .decorations(false)
        .resizable(true)
        .maximizable(true)
        .fullscreen(false)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}
```

- [ ] **Step 4: Keep tray secondary, not primary**

```rust
if let Err(error) = open_primary_shell_window(&app, &manifest.server_url) {
    log_event(LogEvent::error(
        "shell",
        "open_primary_window",
        error,
        [("rendererId", json!(desktop_renderer_id()))],
    ));
}
```

- [ ] **Step 5: Add explicit native commands for maximize/fullscreen toggles**

```rust
#[tauri::command]
fn set_primary_window_fullscreen(app: AppHandle, fullscreen: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(PRIMARY_WINDOW_LABEL)
        .ok_or_else(|| "primary window is unavailable".to_string())?;
    window.set_fullscreen(fullscreen).map_err(|error| error.to_string())
}
```

- [ ] **Step 6: Verify the native build still passes**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/bootstrap.rs src-tauri/src/main.rs src-tauri/src/tray.rs src-tauri/src/settings.rs src-tauri/tauri.conf.json
git commit -m "feat: add borderless primary desktop shell"
```

### Task 3: Add A Managed Review Window With Presentation Controls

**Files:**
- Modify: `src-tauri/src/webview.rs`
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/native-webview.ts`
- Modify: `src/shared/nats-subjects.ts`
- Test: `src/shared/native-webview.test.ts`

- [ ] **Step 1: Write the failing protocol test for review-window presentation controls**

```ts
import { describe, expect, test } from "bun:test"
import { createWebviewOpenCommand } from "./native-webview"

describe("createWebviewOpenCommand", () => {
  test("includes renderer targeting and presentation defaults", () => {
    expect(
      createWebviewOpenCommand({
        rendererId: "desktop:LAGZ0NE",
        webviewId: "review-1",
        target: "http://127.0.0.1:3000",
      }),
    ).toMatchObject({
      type: "webview.open",
      rendererId: "desktop:LAGZ0NE",
      webviewId: "review-1",
      presentation: {
        viewportPreset: "desktop",
        colorScheme: "system",
      },
    })
  })
})
```

- [ ] **Step 2: Run the failing protocol test**

Run: `bun test src/shared/native-webview.test.ts`  
Expected: FAIL until the new presentation payload exists.

- [ ] **Step 3: Extend the shared command model**

```ts
export interface NativeWebviewPresentation {
  viewportPreset: "mobile" | "tablet" | "desktop" | "custom"
  colorScheme: "light" | "dark" | "system"
  width?: number
  height?: number
}
```

```ts
export interface WebviewOpenCommand {
  type: "webview.open"
  rendererId: string
  webviewId: string
  target: string
  targetKind: string
  dockState: string
  presentation: NativeWebviewPresentation
}
```

- [ ] **Step 4: Apply presentation controls in the native review window**

```rust
fn apply_review_window_presentation(
    window: &tauri::WebviewWindow,
    presentation: &NativeWebviewPresentation,
) -> Result<(), String> {
    match presentation.viewport_preset.as_str() {
        "mobile" => window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(390.0, 844.0))),
        "tablet" => window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(834.0, 1112.0))),
        "desktop" => window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(1440.0, 960.0))),
        _ => Ok(()),
    }.map_err(|error| error.to_string())
}
```

- [ ] **Step 5: Add native commands for inspect/devtools open**

```rust
#[tauri::command]
fn open_review_window_devtools(app: AppHandle, webview_id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&webview_id)
        .ok_or_else(|| format!("review window {webview_id} is unavailable"))?;
    window.open_devtools();
    Ok(())
}
```

- [ ] **Step 6: Verify the shared test passes**

Run: `bun test src/shared/native-webview.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/webview.rs src-tauri/src/bootstrap.rs src/shared/protocol.ts src/shared/native-webview.ts src/shared/nats-subjects.ts src/shared/native-webview.test.ts
git commit -m "feat: add managed review window presentation controls"
```

### Task 4: Add Desktop-Specific UI Surfaces For Shell And Review Control

**Files:**
- Modify: `src/client/app/App.tsx`
- Modify: `src/client/app/DesktopCompanionPage.tsx`
- Modify: `src/client/app/useTinkariaState.ts`
- Modify: `src/client/app/TinkariaStateContext.ts`
- Add: `src/client/app/DesktopShellPage.tsx`
- Add: `src/client/app/DesktopReviewControls.tsx`
- Test: `src/client/app/DesktopCompanionPage.test.tsx`

- [ ] **Step 1: Write the failing render test for the desktop shell route**

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { DesktopShellPage } from "./DesktopShellPage"

test("renders the desktop shell without the standard sidebar chrome", () => {
  const html = renderToStaticMarkup(<DesktopShellPage />)

  expect(html).toContain("Tinkaria Desktop")
  expect(html).not.toContain("chat.sidebar")
})
```

- [ ] **Step 2: Run the failing desktop UI test**

Run: `bun test src/client/app/DesktopCompanionPage.test.tsx`  
Expected: FAIL until the desktop shell/review surfaces exist.

- [ ] **Step 3: Add a primary-shell route rendered by the main app**

```tsx
<Routes>
  <Route path="/desktop/:rendererId" element={<DesktopCompanionPage />} />
  <Route path="/desktop-shell" element={<DesktopShellPage />} />
  <Route path="*" element={<TinkariaLayout />} />
</Routes>
```

- [ ] **Step 4: Add review-window controls UI on the desktop page**

```tsx
<DesktopReviewControls
  rendererId={rendererId}
  onViewportChange={(viewportPreset) => setDesktopViewport(rendererId, viewportPreset)}
  onColorSchemeChange={(colorScheme) => setDesktopColorScheme(rendererId, colorScheme)}
  onOpenDevtools={() => openDesktopDevtools(rendererId)}
/>
```

- [ ] **Step 5: Wire the controls to NATS intents in client state**

```ts
function setDesktopViewport(rendererId: string, viewportPreset: "mobile" | "tablet" | "desktop") {
  publishCommand({
    type: "webview.setPresentation",
    rendererId,
    presentation: { viewportPreset },
  })
}
```

- [ ] **Step 6: Verify the UI tests pass**

Run: `bun test src/client/app/DesktopCompanionPage.test.tsx`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/client/app/App.tsx src/client/app/DesktopCompanionPage.tsx src/client/app/useTinkariaState.ts src/client/app/TinkariaStateContext.ts src/client/app/DesktopShellPage.tsx src/client/app/DesktopReviewControls.tsx src/client/app/DesktopCompanionPage.test.tsx
git commit -m "feat: add desktop shell and review control routes"
```

### Task 5: End-To-End Verification On Windows

**Files:**
- Modify: `README.md`
- Modify: `tasks/todo.md`
- Test: runtime smoke only

- [ ] **Step 1: Build the Windows release**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --release --target-dir /tmp/tinkaria-tauri-win-target`  
Expected: PASS

- [ ] **Step 2: Stage the release build for Windows launch**

Run: `cp /tmp/tinkaria-tauri-win-target/x86_64-pc-windows-gnu/release/tinkaria-desktop.exe /mnt/c/Users/duc/AppData/Local/Temp/tinkaria-desktop-release/tinkaria-desktop.exe`  
Expected: file copied

- [ ] **Step 3: Smoke the desktop route in the browser first**

Run: `agent-browser open http://127.0.0.1:5174/desktop/desktop:LAGZ0NE`  
Expected: page opens with no browser errors

- [ ] **Step 4: Launch the Windows desktop app**

Run: `'/mnt/c/Windows/System32/cmd.exe' /C start "" "C:\Users\duc\AppData\Local\Temp\tinkaria-desktop-release\tinkaria-desktop.exe"`  
Expected: desktop app process appears in `tasklist`

- [ ] **Step 5: Verify the live companion log**

Run: `tail -n 40 /mnt/c/Users/duc/.tinkaria/logs/companion.log`  
Expected:
- public attach lines point at `http://127.0.0.1:5174`
- `/nats-ws` succeeds with no `HTTP 200` handshake error
- primary shell opens
- review-window commands can register and log cleanly

- [ ] **Step 6: Update docs and handoff notes**

```md
1. Main desktop shell is borderless and hosts the primary chat app.
2. Managed review window supports viewport presets and inspect/devtools.
3. Windows attach requires the public `/nats-ws` path to return `101 Switching Protocols`.
```

- [ ] **Step 7: Commit**

```bash
git add README.md tasks/todo.md
git commit -m "docs: record two-window desktop verification flow"
```

---

## Self-Review

- Spec coverage: the plan covers the public attach fix, the borderless primary shell, the managed review window, desktop-specific browser routes, and Windows verification.
- Placeholder scan: no `TODO`/`TBD` markers remain; each task names concrete files, commands, and expected outcomes.
- Type consistency: `rendererId`, `webview.open`, `webview.setPresentation`, `viewportPreset`, and `colorScheme` are used consistently across the plan.
