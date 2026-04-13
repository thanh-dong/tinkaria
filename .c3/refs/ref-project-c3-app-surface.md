---
id: ref-project-c3-app-surface
c3-seal: 846097f91be9b398235d69080ad064b2719eb9ffee868c91ad378eba7ea75078
title: project-c3-app-surface
type: ref
goal: Provision the project-scoped C3 app surface so each local project can expose the important C3 jobs such as orientation, ownership lookup, and impact inspection without duplicating chat rendering logic.
status: provisioned
---

## Goal

Provision the project-scoped C3 app surface so each local project can expose the important C3 jobs such as orientation, ownership lookup, and impact inspection without duplicating chat rendering logic.

## Choice

Keep project-level MCP Apps as an extension of current project and transcript ownership. The projects surface exposes lightweight app entry points and previews, while chat renders the same app sessions and artifact fallbacks through the shared embed/artifact spine.

## Why

Project C3 experiences should not become a parallel product surface with different transport or rendering semantics. The same job, session identity, fallback behavior, and embed shell must work whether the user enters from the projects screen or a chat transcript.

## How

Read models must expose only lightweight project app summaries over the existing `local-projects` snapshot channel. App detail, manifests, previews, and sessions are hydrated lazily per project. Phase 1 must optimize for the user finishing the orientation and impact-inspection jobs correctly; richer previews and delight can come later.
