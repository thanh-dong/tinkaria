---
id: adr-20260403-tauri-two-window-desktop-model
c3-seal: c9fd67a7f04ee571cb2bbb6075bcb24d4de37bea7389b1037ec36b96011a59c3
title: tauri-two-window-desktop-model
type: adr
goal: Adopt a two-window desktop model for Tinkaria. Tauri should host a borderless primary shell window for the main chat application, with native maximize, move/drag, and resize behavior, while a second managed review window remains controllable from chat and NATS for preview, inspection, viewport switching, theme switching, and responsive verification. The tray stays useful for lifecycle and diagnostics, but the desktop runtime is no longer limited to companion-only settings access.
status: proposed
date: "2026-04-03"
---

## Goal

Adopt a two-window desktop model for Tinkaria. Tauri should host a borderless primary shell window for the main chat application, with native maximize, move/drag, and resize behavior, while a second managed review window remains controllable from chat and NATS for preview, inspection, viewport switching, theme switching, and responsive verification. The tray stays useful for lifecycle and diagnostics, but the desktop runtime is no longer limited to companion-only settings access.

## Notes

The current browser-hosted desktop shell contract is narrower than the original fullscreen-oriented sketch. The main chat window now exposes native shell controls primarily through the chat navbar Compose slot, which swaps to collapse/expand sidebar, move window, maximize, and new-project actions when the Tauri runtime is present. The sidebar keeps only a compact collapsed-state control stub so the native controls remain reachable when the main sidebar is hidden.
