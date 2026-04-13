---
id: adr-20260402-tauri-companion-branding-and-logging
c3-seal: 4914ab61eb5280c1b03d5257d64fba16dfd852af748820ab037741dce285fd12
title: tauri-companion-branding-and-logging
type: adr
goal: Lock the companion-only Tauri runtime to Tinkaria branding and structured failure logging so native attach failures are diagnosable without guesswork.
status: proposed
date: "2026-04-02"
---

## Goal

Keep the Tauri runtime companion-only, branded as Tinkaria, and instrumented so every failure reports what failed, where it failed, and the relevant runtime context.
