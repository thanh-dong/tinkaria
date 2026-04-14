---
id: adr-20260414-extension-preferences
title: extension-preferences
type: adr
goal: 'Add user-controllable enable/disable preferences for extensions, persisted via event sourcing following the profile pattern, with a three-level hierarchy: manifest declares, filesystem detects, user preferences override.'
status: proposed
date: "2026-04-14"
---

## Goal

Add user-controllable enable/disable preferences for extensions, persisted via event sourcing following the profile pattern, with a three-level hierarchy: manifest declares, filesystem detects, user preferences override.

## Context

The extension system (adr-20260414-extension-system) auto-detects extensions via filesystem probes and shows all detected extensions in the Project Page. Users have no way to hide extensions they don't care about. The existing event-sourcing infrastructure (ref-ref-event-sourcing) and profile persistence pattern provide a proven model for adding new user-scoped settings.

## Decision

Event-sourced preferences following the profile pattern. Three-level visibility hierarchy:

1. **Manifest declares** — extension must exist in the client/server registries
2. **Filesystem detects** — `/api/ext/detect` probes the project; only detected extensions proceed
3. **User preferences override** — if `pref.enabled === false`, the extension is hidden even when detected

Implementation:
- New shared types: `ExtensionPreference`, `ExtensionPreferencesSnapshot` in `src/shared/extension-types.ts`
- New event log: `extension-prefs.jsonl` with `extension_preference_set` events
- New NATS commands: `extension.preference.set`, `extension.preference.list`
- New WS subscription topic: `extension-preferences`
- New client hook: `useExtensionPreferencesSubscription`
- New settings tab: `ExtensionsTab` in the `/tinkaria` settings page
- ProjectPage filters `activeExtensions` by combining detection results with preference state

## Consequences

- Global toggle only — no per-project overrides in v1. All projects share the same preference set.
- Default is enabled: extensions with no stored preference are treated as enabled (`pref?.enabled !== false`).
- Follows the same compaction lifecycle as all other JSONL logs — included in snapshot, truncated after compact.
