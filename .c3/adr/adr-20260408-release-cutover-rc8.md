---
id: adr-20260408-release-cutover-rc8
c3-seal: 2ee088a405535f0fd476a78c5bd35c925a5caedc492ea162391572c0dcb9982b
title: release-cutover-rc8
type: adr
goal: 'Cut `1.0.0-rc.8` from the current deployment-model branch, deploy it as the packaged release artifact, and replace the builder host''s live service without dropping `claude.tini.works`. The chosen rollout is side-by-side split-mode cutover: keep the old backend on `:3100`, start the new release on `:3101` with `TINKARIA_SPLIT=true`, verify the new backend directly (`/health`, `/auth/token`, `/`, `/nats-ws`), switch the reverse proxy upstream, then stop and disable the old unit after the public route proves the split backend healthy.'
status: adopted
date: "2026-04-08"
---

## Goal

Cut `1.0.0-rc.8` from the current deployment-model branch, deploy it as the packaged release artifact, and replace the builder host's live service without dropping `claude.tini.works`. The chosen rollout is side-by-side split-mode cutover: keep the old backend on `:3100`, start the new release on `:3101` with `TINKARIA_SPLIT=true`, verify the new backend directly (`/health`, `/auth/token`, `/`, `/nats-ws`), switch the reverse proxy upstream, then stop and disable the old unit after the public route proves the split backend healthy.
