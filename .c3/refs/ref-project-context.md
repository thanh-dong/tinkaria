---
id: ref-project-context
c3-seal: e0c718de06fadf1b26c0b9b41e0df7dae107f6e6185ccbd60f9919e202216429
title: project-context
type: ref
goal: Own repository-level documentation, packaging, static assets, and agent skill metadata that describe or package Tinkaria outside the client/server runtime.
uses:
    - ref-pwa
---

## Goal

Own repository-level documentation, packaging, static assets, and agent skill metadata that describe or package Tinkaria outside the client/server runtime.

## Choice

Use a dedicated ref to own repository-level context and packaging artifacts instead of attaching code-map patterns to the system entity.

## Why

System entities describe overall architecture context but are not valid code-map owners. Repository docs, build config, static assets, and skill metadata still need a discoverable owner so C3 coverage remains complete.

## How

Map non-runtime repository context here: root docs and packaging files, static assets under `assets/` and `public/`, the GitHub publishing workflow, and agent skill metadata under `.agents/skills/shadcn/` and `.claude/skills/`. Keep application runtime files on their feature components and shared behavioral refs/rules.
