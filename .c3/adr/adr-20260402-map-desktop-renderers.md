---
id: adr-20260402-map-desktop-renderers
c3-seal: 5a5f7a4e9fc5811e97d0ae757f3c615f366bb1d0e5b1c3f1ef100313e7475119
title: map-desktop-renderers
type: adr
goal: Map src/server/desktop-renderers.ts and its test into c3-205 nats-transport codemap. File was added by Codex to support the desktop-renderers NATS subscription topic but remained uncharted. Used by nats-publisher.ts (getSnapshot) and nats-responders.ts (register/unregister commands).
status: proposed
date: "2026-04-02"
---

# map-desktop-renderers
## Goal

Map src/server/desktop-renderers.ts and its test into c3-205 nats-transport codemap. File was added by Codex to support the desktop-renderers NATS subscription topic but remained uncharted. Used by nats-publisher.ts (getSnapshot) and nats-responders.ts (register/unregister commands).
