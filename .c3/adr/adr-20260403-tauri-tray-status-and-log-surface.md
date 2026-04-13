---
id: adr-20260403-tauri-tray-status-and-log-surface
c3-seal: 5f9665326252abcecd535e39ce9043afc49902b95b2d7a48fd76dbb6f6b925ea
title: tauri-tray-status-and-log-surface
type: adr
goal: 'Tighten the Tauri companion so failures are diagnosable from native surfaces alone: the tray must expose current connection targets and state, and logs must be persistently accessible even when the browser-facing settings route is unavailable.'
date: "2026-04-03"
---

## Goal

Tighten the Tauri companion so failures are diagnosable from native surfaces alone: the tray must expose current connection targets and state, and logs must be persistently accessible even when the browser-facing settings route is unavailable.

## Decision

Add native tray diagnostics rows for status, server, NATS target, renderer identity, and last error. Persist structured companion logs to a local runtime log file and add tray access to open that file directly. Keep the local settings window as a secondary diagnostics surface that mirrors the same bootstrap and log information instead of depending on the browser app route.

## Consequences

The companion becomes operational even when the browser app cannot attach over NATS WebSocket from Windows. Native failures remain visible and inspectable, but the runtime now owns a little more local state for tray snapshots and persistent log file management.
