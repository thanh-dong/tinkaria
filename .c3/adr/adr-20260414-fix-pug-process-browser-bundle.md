---
id: adr-20260414-fix-pug-process-browser-bundle
c3-seal: d2343d48327debdb36668fde66361701f9d7b009db5375bad937cdeee4be3bf5
title: fix-pug-process-browser-bundle
type: adr
goal: Fix the browser regression introduced by the Pug additive where the client bundle executes a Node-oriented `process` reference and crashes before rich content can render.
status: proposed
date: "2026-04-14"
---

## Goal

Fix the browser regression introduced by the Pug additive where the client bundle executes a Node-oriented `process` reference and crashes before rich content can render.
