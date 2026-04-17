---
id: adr-20260417-toggle-fab-on-copy-target
c3-seal: 66ee9d15b835816a67137ca821516770a23834ed9ee0a021ef2bb673a04ec7df
title: toggle-fab-on-copy-target
type: adr
goal: Toggle the mobile UI identity FAB off after the user successfully selects a copy target from the overlay, so the inspector does not remain latched after copy completion.
status: implemented
date: "2026-04-17"
---

## Goal

Toggle the mobile UI identity FAB off after the user successfully selects a copy target from the overlay, so the inspector does not remain latched after copy completion.

Work Breakdown [ASSUMED approval]

- Add a focused RED regression for the mobile FAB deactivation rule.
- Implement a strict typed helper for successful-copy deactivation.
- Wire successful overlay copy to deactivate mobile FAB and clear selected target state.
- Verify with focused and broader client checks.
Risks
- Toggling on first surface tap would make the overlay unusable because no copy row could be selected. The implementation toggles only after clipboard success.
- Existing unrelated C3 transcript-render-state-machine edits are present in the worktree and are intentionally not touched by this change.
Affected Components
- c3-101 app-shell: hosts the overlay controller and mobile FAB state.
- c3-108 ui-identity: owns identity selection/copy behavior.
- c3-104 ui-primitives: FAB primitive behavior remains unchanged except consuming active state.
Parent Delta
- Component delta: YES for app-shell/ui-identity behavior in src/client/app/App.tsx. UI primitive contract unchanged.
- Container delta: NO; c3-1 already owns client app shell, ui identity, and ui primitives.
- Context delta: NO; no topology or runtime boundary change.
- Refs/Rules delta: NO; implementation complies with existing strict TypeScript, React no-effects, and UI identity composition rules.
