---
id: adr-20260406-remove-tauri-companion
c3-seal: c35ef0a010f382bc5b666ecb028ea4cb8c467a5d1290913fbf37914cf414a0ce
title: Remove Tauri Companion Runtime
type: adr
goal: 'Remove the obsolete Tauri companion runtime now that kit development supersedes it. Scope: delete the src-tauri runtime, browser/server companion endpoints and protocol types, Tauri-specific UI affordances, package scripts/dependencies, stale tests, and C3 entities that only modeled the companion path. Risks: avoid breaking unrelated chat/sidebar/local-project flows and keep any non-companion native-webview work only if it still has live callers after cleanup.'
status: accepted
date: "2026-04-06"
---
