# Tauri Companion Native Webview Design

## Goal

Add a Tauri desktop companion that provides native capabilities to an already-running Tinkaria main server. The companion is not the frontend host. The main server remains the owner of the browser UI. Tauri only adds:

- tray lifecycle
- settings surface
- native managed webviews
- native inspection hooks for companion-hosted webviews
- a native NATS peer for desktop-only capabilities

The companion goal is not merely "open a native window". The companion exists so Tinkaria can control and inspect hosted webviews in ways the browser UI cannot. First-cut companion-managed webviews should support:

- capturing `console.log` and inspection output when needed
- switching viewport mode between mobile / tablet / desktop
- switching dark / light appearance
- retaining styling parity with the current browser-hosted webview experience

The main server is expected to already be running at `http://127.0.0.1:5174`.

## Problem

Trying to make Tauri become the main frontend too early creates the wrong coupling:

- it turns desktop startup into app startup orchestration
- it forces browser UI reachability issues into the desktop shell boundary
- it makes companion-native capabilities harder to isolate and verify

What Tinkaria actually needs first is smaller:

- a native companion that can live in the tray
- a clear way for the main server to advertise embedded NATS details
- a controlled native webview host that the browser UI can steer toward when available
- a native inspection and rendering-control surface around that hosted webview

## Current Project Context

The current codebase already has the right broad seams:

- the Bun server is the stateful authority
- embedded NATS is already the app runtime fabric
- the browser UI already depends on NATS-over-WebSocket
- Tauri already has an experimental shell and native webview command path

The design change here is boundary-related, not transport-related:

- Tauri should stop trying to be the main UI shell for now
- the main server should explicitly advertise companion bootstrap information
- the companion should attach to that server and become a native capability provider

## Scope

### In scope

- Tauri desktop companion only
- tray menu with:
  - `Open Settings`
  - `Exit`
- automatic reconnect behavior
- disabled companion-hosted views when disconnected
- main-server companion discovery from `127.0.0.1:5174`
- server advertisement of embedded NATS coordinates and auth
- companion registration over NATS
- native managed webviews hosted by the companion
- inspection controls for companion-hosted webviews
- viewport switching for companion-hosted webviews
- dark/light switching for companion-hosted webviews
- styling parity with the existing browser webview experience
- browser UI steering to companion-hosted webviews when available

### Out of scope

- making Tauri the main frontend shell
- having Tauri launch or supervise the Bun server
- tray actions for manual reconnect in the first cut
- broad arbitrary desktop window management beyond the controlled webview path

## Design Summary

The main server remains primary. It serves the browser UI and owns embedded NATS.

The Tauri app is a companion process:

1. user launches Tauri companion
2. companion checks the main server at `http://127.0.0.1:5174`
3. companion reads a small companion manifest from that server
4. companion connects to the advertised embedded NATS endpoint
5. companion registers as a desktop renderer / native capability host
6. browser UI observes that renderer through shared NATS state
7. browser UI steers eligible content to companion-managed native webviews

If the companion is unavailable or disconnected, the browser UI keeps working and falls back to normal browser rendering.

## Architecture

### Main server

Responsibilities:

- serve browser UI from `5174`
- host embedded NATS
- advertise companion bootstrap info
- remain the source of truth for app state

### Browser UI

Responsibilities:

- load from the main server
- connect to embedded NATS over WebSocket
- observe companion availability
- request companion-native rendering when appropriate
- fall back when no companion is available

### Tauri companion

Responsibilities:

- tray icon and minimal tray menu
- settings window
- auto-reconnect lifecycle
- connect to embedded NATS as a native peer
- create/close/navigate native managed webviews
- capture console and inspection output from companion-hosted webviews
- switch viewport/device presentation for companion-hosted webviews
- switch dark/light mode for companion-hosted webviews
- preserve a familiar look relative to the current browser webview
- publish companion presence and status

## Discovery

The main server should expose one small explicit companion manifest at `5174`.

Recommended path:

- `GET /desktop-companion.json`

Recommended payload:

- `serverUrl`
- `natsUrl`
- `natsWsUrl`
- `authToken`
- `appName`
- `version`

This is not a runtime control API. It is a bootstrap advertisement only.

## Runtime Model

After bootstrap, runtime coordination stays on NATS.

### Main flows

1. **Companion registration**
- companion connects to NATS
- companion publishes `desktop.register`
- server tracks companion availability
- browser UI sees desktop renderer snapshots

2. **Native webview request**
- browser UI requests `webview.open`
- request is addressed to a known companion renderer id
- Tauri companion executes native webview action
- Tauri companion publishes state and lifecycle updates

2. **Native inspection and presentation control**
- browser UI or settings requests inspection output, viewport mode, or appearance changes
- Tauri companion applies those changes to the managed webview
- Tauri companion publishes console output, inspection state, and current presentation mode

3. **Disconnect**
- companion loses main server or embedded NATS
- companion-hosted views become unavailable
- settings surface shows disconnected state
- browser UI falls back to normal browser rendering

## Tray And Settings UX

First-cut tray menu:

- `Open Settings`
- `Exit`

No manual reconnect entry in the first cut.

Reconnect behavior:

- automatic only
- if reconnect is in progress, companion-hosted views should be disabled
- if reconnect fails, companion-hosted views should remain disabled until connection is restored

Settings window should show:

- connected / disconnected state
- discovered main server URL
- discovered NATS endpoints
- renderer id / capability state
- current hosted webview viewport mode
- current hosted webview appearance mode

## Native Webview Model

The companion owns native managed webviews. These webviews may point at:

- main-server-hosted pages
- local port content
- LAN/Tailscale hosts
- controlled proxied remote targets later

In this design, native webviews are companion-owned surfaces, not the main application shell.

First-cut managed webview controls should include:

- open / close / navigate
- console capture and inspection output
- viewport mode:
  - mobile
  - tablet
  - desktop
- appearance mode:
  - light
  - dark

Presentation should stay visually close to the existing browser-hosted webview path so switching between fallback browser rendering and companion-hosted rendering does not feel like a product jump.

## Trust Model

The browser UI remains unprivileged with respect to native operations.

- browser UI can request
- Tauri companion validates and executes
- server remains authoritative for shared state

Native operations should be renderer-targeted so multiple companions do not all react to the same command.

## First Implementation

1. Add companion manifest endpoint on the main server at `5174`
2. Make Tauri start as a companion only
3. Add tray with `Open Settings` and `Exit`
4. Read manifest and connect to embedded NATS
5. Register companion availability over NATS
6. Show connection status in settings
7. Keep native webview command handling in the companion
8. Add first-cut inspection and presentation controls:
   - console capture
   - viewport switching
   - dark/light switching
9. Let browser UI steer only when a companion is connected

## Testing

First verification target:

1. start the main server on `5174`
2. launch the Tauri companion
3. companion shows connected state in settings
4. server snapshot shows registered desktop renderer
5. browser UI detects that renderer
6. requesting a controlled view opens a native companion webview
7. console output can be observed from the companion-managed webview
8. viewport and dark/light mode can be changed
9. stopping NATS or the server disables the companion-hosted view and browser falls back cleanly

## Recommendation

Proceed with the companion-only model. Do not spend more effort making Tauri the frontend host yet. The right first milestone is:

- main server on `5174`
- manifest advertisement
- companion tray/settings lifecycle
- companion NATS attachment
- native webview capability as an optional peer
