---
id: adr-20260415-bring-back-pug-enrichment
c3-seal: 46fbcc4eed616c80a8e50e528b7e2654a7f7725f51f5e0f494d6ee916f2a6538
title: bring-back-pug-enrichment
type: adr
goal: 'Decision: do not bring back server-side Pug enrichment. Keep Puggy frontend-only inside rich-content rendering to reduce moving pieces.'
status: implemented
date: "2026-04-15"
---

## Goal

Decision: do not bring back server-side Pug enrichment. Keep Puggy frontend-only inside rich-content rendering to reduce moving pieces.

Affected components:

- c3-106 present-content: corresponding component behavior is unchanged at the transcript/tool contract boundary. It passes `format: "pug"` and original source through the existing artifact renderer path, with no `compiledHtml` result field and no hydration shape change.
- c3-107 rich-content: owns the frontend render behavior for Puggy shorthand by compiling `format: "pug"` / fenced `pug` source into sandboxed HTML at render time.
- c3-204 shared-types: owns the copied `src/shared/puggy/**` renderer files via code-map, but shared transcript types stay stable.
- c3-216 codex/server runtime: explicitly not updated for Pug precompilation or enrichment.
Reason: the only product need is shorter-form HTML for artifacts. Server enrichment would add transcript result metadata, shared hydration fields, and client/server contract surface without user value. Fenced `pug` blocks and `present_content` payloads can keep their original `format: "pug"` and be rendered by the existing client rich-content embed path.

Scope: frontend-only Pug shorthand remains in `src/client/components/rich-content/EmbedRenderer.tsx` using the copied shared Puggy renderer. No changes to present_content server payloads, shared transcript result types, or hydration shape.

Verification target: focused rich-content tests and typecheck prove the frontend path works without server enrichment.
