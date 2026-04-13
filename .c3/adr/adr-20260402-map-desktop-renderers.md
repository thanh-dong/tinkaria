---
id: adr-20260402-map-desktop-renderers
c3-seal: 64a35fe7958b4cf7c3088670db22a280d27c4ffbebbdb9f0458fa93818c8b325
title: map-desktop-renderers
type: adr
goal: Map src/server/desktop-renderers.ts and its test into c3-205 nats-transport codemap. File was added by Codex to support the desktop-renderers NATS subscription topic but remained uncharted. Used by nats-publisher.ts (getSnapshot) and nats-responders.ts (register/unregister commands).
status: proposed
date: "2026-04-02"
---
