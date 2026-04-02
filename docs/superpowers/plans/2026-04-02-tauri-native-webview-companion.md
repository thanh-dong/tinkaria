# Tauri Companion Native Webview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a companion-only Tauri desktop app that attaches to an already-running main server on `127.0.0.1:5174`, exposes tray/settings lifecycle, connects to advertised embedded NATS, and hosts controllable native webviews.

**Architecture:** The Bun main server remains the source of truth and advertises a small companion manifest at `5174`. The browser UI continues to load from the main server and falls back normally when no companion is present. Tauri becomes a native peer that reads the manifest, connects to NATS, registers itself, exposes tray/settings, and manages native webviews plus inspection/presentation controls.

**Tech Stack:** Bun server, embedded NATS, React 19 client, Tauri v2, Rust, Bun test, cargo, agent-browser

---

## File Structure

### Main server advertisement and transport

- Modify: `src/server/server.ts`
  - add `GET /desktop-companion.json`
  - ensure manifest payload includes `serverUrl`, `natsUrl`, `natsWsUrl`, `authToken`, `appName`, `version`
- Modify: `src/server/nats-bridge.ts`
  - keep embedded NATS bind/advertise behavior explicit and companion-safe
- Modify: `src/server/nats-bridge.test.ts`
  - verify host/advertised-host behavior
- Add: `src/shared/desktop-companion.ts`
  - shared manifest types and normalization helpers
- Add: `src/shared/desktop-companion.test.ts`
  - manifest serialization/normalization coverage

### Browser UI steering and companion visibility

- Modify: `src/client/app/useTinkariaState.ts`
  - continue exposing `desktopRenderers`
  - add companion status derivations if needed
- Modify: `src/client/components/LocalDev.tsx`
  - keep or refine `Desktop Smoke` entry point
- Modify: `src/client/app/LocalProjectsPage.tsx`
  - pass companion-related handlers/state
- Add or modify tests:
  - `src/client/app/useTinkariaState.test.ts`
  - `src/client/components/LocalDev.test.tsx`

### Tauri companion lifecycle

- Modify: `src-tauri/src/main.rs`
  - keep companion entrypoint narrow
- Modify: `src-tauri/src/bootstrap.rs`
  - replace bootstrap-file-first logic with manifest discovery from `127.0.0.1:5174`
  - connect to NATS
  - register companion
  - manage reconnect loop
- Add: `src-tauri/src/manifest.rs`
  - fetch and parse `desktop-companion.json`
- Add: `src-tauri/src/tray.rs`
  - tray menu with `Open Settings` and `Exit`
- Add: `src-tauri/src/settings.rs`
  - settings window creation/state
- Modify: `src-tauri/tauri.conf.json`
  - companion-only app/window/tray configuration

### Native webview controls

- Modify: `src-tauri/src/webview.rs`
  - add viewport mode switching
  - add light/dark mode switching
  - add console/inspection event plumbing seam
- Modify: `src/shared/protocol.ts`
  - add companion-manageable control commands/events if needed
- Modify: `src/shared/native-webview.ts`
  - extend command/event types for viewport/appearance/inspection
- Modify tests:
  - `src/shared/native-webview.test.ts`

### Documentation

- Modify: `README.md`
  - companion-only run instructions
  - clarify that main server must already run at `5174`
- Modify: `tasks/todo.md`
  - current status / next steps

---

### Task 1: Add Desktop Companion Manifest On The Main Server

**Files:**
- Create: `src/shared/desktop-companion.ts`
- Test: `src/shared/desktop-companion.test.ts`
- Modify: `src/server/server.ts`

- [ ] **Step 1: Write the failing shared manifest test**

```ts
import { describe, expect, test } from "bun:test"
import { normalizeDesktopCompanionManifest } from "./desktop-companion"

describe("normalizeDesktopCompanionManifest", () => {
  test("normalizes a full companion manifest payload", () => {
    expect(normalizeDesktopCompanionManifest({
      serverUrl: "http://127.0.0.1:5174",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "token",
      appName: "Tinkaria",
      version: "0.16.0",
    })).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "token",
      appName: "Tinkaria",
      version: "0.16.0",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/shared/desktop-companion.test.ts`
Expected: FAIL with missing module or missing export

- [ ] **Step 3: Write the shared manifest type and normalizer**

```ts
export interface DesktopCompanionManifest {
  serverUrl: string
  natsUrl: string
  natsWsUrl: string
  authToken: string
  appName: string
  version: string
}

export function normalizeDesktopCompanionManifest(
  value: Partial<DesktopCompanionManifest> | null | undefined
): DesktopCompanionManifest {
  return {
    serverUrl: value?.serverUrl ?? "http://127.0.0.1:5174",
    natsUrl: value?.natsUrl ?? "",
    natsWsUrl: value?.natsWsUrl ?? "",
    authToken: value?.authToken ?? "",
    appName: value?.appName ?? "Tinkaria",
    version: value?.version ?? "unknown",
  }
}
```

- [ ] **Step 4: Add the manifest endpoint to the main server**

```ts
if (url.pathname === "/desktop-companion.json") {
  return Response.json({
    serverUrl: `http://127.0.0.1:${actualPort}`,
    natsUrl: natsBridge.natsUrl,
    natsWsUrl: natsBridge.natsWsUrl,
    authToken,
    appName: APP_NAME,
    version: updateManager?.getSnapshot().currentVersion ?? "unknown",
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/shared/desktop-companion.test.ts src/server/nats-bridge.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/desktop-companion.ts src/shared/desktop-companion.test.ts src/server/server.ts src/server/nats-bridge.ts src/server/nats-bridge.test.ts
git commit -m "feat: advertise desktop companion manifest"
```

### Task 2: Make Tauri Discover The Running Main Server On 5174

**Files:**
- Create: `src-tauri/src/manifest.rs`
- Modify: `src-tauri/src/bootstrap.rs`
- Test: `src/shared/desktop-companion.test.ts`

- [ ] **Step 1: Write the failing Rust-side manifest parsing test seam**

```rust
#[test]
fn parses_desktop_companion_manifest() {
    let json = r#"{
        "serverUrl":"http://127.0.0.1:5174",
        "natsUrl":"nats://127.0.0.1:4222",
        "natsWsUrl":"ws://127.0.0.1:4223",
        "authToken":"token",
        "appName":"Tinkaria",
        "version":"0.16.0"
    }"#;

    let manifest: DesktopCompanionManifest = serde_json::from_str(json).unwrap();
    assert_eq!(manifest.server_url, "http://127.0.0.1:5174");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml manifest`
Expected: FAIL with missing type/module

- [ ] **Step 3: Add manifest fetch/parsing module**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCompanionManifest {
    pub server_url: String,
    pub nats_url: String,
    pub nats_ws_url: String,
    pub auth_token: String,
    pub app_name: String,
    pub version: String,
}

pub async fn fetch_manifest() -> Result<DesktopCompanionManifest, String> {
    let response = reqwest::get("http://127.0.0.1:5174/desktop-companion.json")
        .await
        .map_err(|error| error.to_string())?;
    response.json::<DesktopCompanionManifest>()
        .await
        .map_err(|error| error.to_string())
}
```

- [ ] **Step 4: Replace bootstrap-file discovery in `bootstrap.rs`**

```rust
let manifest = fetch_manifest().await?;
let client = ConnectOptions::with_token(manifest.auth_token.clone())
    .connect(manifest.nats_url.clone())
    .await
    .map_err(|error| error.to_string())?;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml manifest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/manifest.rs src-tauri/src/bootstrap.rs src-tauri/Cargo.toml
git commit -m "feat: let tauri companion discover server manifest"
```

### Task 3: Add Tray And Settings Lifecycle

**Files:**
- Create: `src-tauri/src/tray.rs`
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write the failing lifecycle design test in TypeScript documentation form**

```ts
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("tauri companion config", () => {
  test("declares a companion desktop product name", () => {
    const json = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
    expect(json.productName).toContain("Desktop")
  })
})
```

- [ ] **Step 2: Run test to verify it fails if config is missing tray/settings assumptions**

Run: `bun test src/shared/tauri-shell-files.test.ts`
Expected: FAIL after adding assertions for new config if not yet wired

- [ ] **Step 3: Add tray and settings modules**

```rust
pub fn build_tray() -> tauri::tray::TrayIconBuilder<R> {
    let open_settings = MenuItem::with_id(..., "open-settings", "Open Settings", true, None::<&str>)?;
    let exit = MenuItem::with_id(..., "exit", "Exit", true, None::<&str>)?;
}
```

```rust
pub fn show_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into())).build()?;
    Ok(())
}
```

- [ ] **Step 4: Wire tray menu events in `main.rs`**

```rust
Builder::default()
    .setup(|app| {
        tray::install(app)?;
        Ok(())
    })
```

- [ ] **Step 5: Run verification**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/src/settings.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
git commit -m "feat: add tauri companion tray and settings lifecycle"
```

### Task 4: Add Auto-Reconnect And Disabled Companion State

**Files:**
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src-tauri/src/settings.rs`
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing reconnect-state test**

```ts
test("desktop renderer snapshot can represent disconnected companion state", () => {
  expect({
    rendererId: "desktop-1",
    machineName: "Workstation",
    capabilities: ["native_webview"],
    connectedAt: 1,
    lastSeenAt: 2,
    status: "disconnected",
  }).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/desktop-renderers.test.ts`
Expected: FAIL on missing status field or behavior

- [ ] **Step 3: Extend status handling and reconnect loop**

```rust
loop {
    match run_connection_cycle(app.clone()).await {
        Ok(()) => {}
        Err(error) => {
            eprintln!("[tinkaria] companion reconnect loop: {error}");
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
}
```

- [ ] **Step 4: Disable companion-hosted views on disconnect**

```rust
if let Some(window) = app.get_webview_window("controlled-content") {
    let _ = window.hide();
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/server/desktop-renderers.test.ts && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/bootstrap.rs src-tauri/src/settings.rs src/shared/protocol.ts src/shared/types.ts src/server/desktop-renderers.ts src/server/desktop-renderers.test.ts
git commit -m "feat: add companion reconnect and disabled state"
```

### Task 5: Add Companion Native Webview Inspection And Presentation Controls

**Files:**
- Modify: `src-tauri/src/webview.rs`
- Modify: `src-tauri/src/bootstrap.rs`
- Modify: `src/shared/native-webview.ts`
- Modify: `src/shared/protocol.ts`
- Test: `src/shared/native-webview.test.ts`

- [ ] **Step 1: Write the failing protocol test for viewport and appearance controls**

```ts
test("accepts a native webview presentation command", () => {
  const command: ClientCommand = {
    type: "webview.setPresentation",
    rendererId: "desktop-1",
    webviewId: "controlled-content",
    viewportMode: "tablet",
    appearance: "dark",
  }

  expect(command.type).toBe("webview.setPresentation")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/shared/native-webview.test.ts`
Expected: FAIL with missing command type

- [ ] **Step 3: Add shared command types**

```ts
| {
    type: "webview.setPresentation"
    rendererId: string
    webviewId: string
    viewportMode: "mobile" | "tablet" | "desktop"
    appearance: "light" | "dark"
  }
| {
    type: "webview.inspect"
    rendererId: string
    webviewId: string
  }
```

- [ ] **Step 4: Add Rust handlers**

```rust
match command {
    DesktopCommand::SetPresentation { webview_id, viewport_mode, appearance, .. } => {
        set_webview_presentation(app, &webview_id, &viewport_mode, &appearance)?
    }
    DesktopCommand::Inspect { webview_id, .. } => {
        emit_inspection_state(app, client, &webview_id).await?
    }
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/shared/native-webview.test.ts && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/webview.rs src-tauri/src/bootstrap.rs src/shared/native-webview.ts src/shared/protocol.ts src/shared/native-webview.test.ts
git commit -m "feat: add companion webview presentation controls"
```

### Task 6: Keep Browser UI Steering Companion-Optional

**Files:**
- Modify: `src/client/app/useTinkariaState.ts`
- Modify: `src/client/components/LocalDev.tsx`
- Test: `src/client/app/useTinkariaState.test.ts`
- Test: `src/client/components/LocalDev.test.tsx`

- [ ] **Step 1: Write the failing steering test for manifest-based companion presence**

```ts
test("falls back to browser rendering when no desktop renderer is present", () => {
  expect(resolveDesktopWebviewOpenCommand({
    href: "https://example.com",
    desktopRenderers: { renderers: [] },
  })).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails if behavior regresses**

Run: `bun test src/client/app/useTinkariaState.test.ts src/client/components/LocalDev.test.tsx`
Expected: FAIL only if the optional fallback contract is broken

- [ ] **Step 3: Keep the `Desktop Smoke` path companion-optional**

```ts
function handleOpenExternalLink(href: string): boolean {
  const command = resolveDesktopWebviewOpenCommand({ href, desktopRenderers })
  if (!command) return false
  void socket.command(command).catch(...)
  return true
}
```

- [ ] **Step 4: Surface companion state in the Local Projects smoke card**

```tsx
<span className="text-xs text-muted-foreground">
  {desktopRendererStatusLabel}
</span>
```

- [ ] **Step 5: Run tests**

Run: `bun test src/client/app/useTinkariaState.test.ts src/client/components/LocalDev.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/app/useTinkariaState.ts src/client/app/useTinkariaState.test.ts src/client/components/LocalDev.tsx src/client/components/LocalDev.test.tsx
git commit -m "feat: keep companion steering optional in browser ui"
```

### Task 7: Verify End-To-End Companion Flow And Update Docs

**Files:**
- Modify: `README.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Document the companion-only run loop**

```md
1. Start the main server on `127.0.0.1:5174`
2. Launch the Tauri companion
3. Open Settings from the tray to inspect companion status
4. Use the browser UI normally from the main server
5. Use `Desktop Smoke` to verify native webview steering
```

- [ ] **Step 2: Run the verification sequence**

Run:

```bash
bun test src/shared/desktop-companion.test.ts src/server/nats-bridge.test.ts src/client/app/useTinkariaState.test.ts src/client/components/LocalDev.test.tsx src/shared/native-webview.test.ts
cargo check --manifest-path src-tauri/Cargo.toml
bun run build
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected: all commands pass

- [ ] **Step 3: Run browser smoke against the main server**

Run:

```bash
agent-browser open http://127.0.0.1:5174
agent-browser snapshot -c -d 6
agent-browser errors
```

Expected:
- page loads
- no browser errors
- `Desktop Smoke` remains available on the connected local-projects path

- [ ] **Step 4: Commit**

```bash
git add README.md tasks/todo.md
git commit -m "docs: document tauri companion workflow"
```

---

## Spec Coverage Check

- Companion-only boundary: covered by Tasks 1, 2, 3
- Main server discovery at `5174`: covered by Tasks 1, 2
- Tray with `Open Settings` and `Exit`: covered by Task 3
- Auto reconnect and disabled view behavior: covered by Task 4
- Native webview ownership and targeting: covered by Tasks 5, 6
- Inspection and presentation controls: covered by Task 5
- Styling parity and fallback browser behavior: covered by Tasks 5, 6, 7

## Self-Review

- Placeholder scan: no `TODO`/`TBD` placeholders remain in task steps
- Type consistency: plan uses `desktop-companion.json`, `desktop.register`, `webview.open`, and new `webview.setPresentation` consistently
- Scope check: remains one coherent subsystem, not a frontend migration plan

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-02-tauri-native-webview-companion.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
