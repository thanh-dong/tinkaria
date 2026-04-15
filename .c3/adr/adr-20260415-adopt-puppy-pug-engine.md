---
id: adr-20260415-adopt-puppy-pug-engine
c3-seal: d77fd1c2722df021c04cc7886417a77469ab007f72508ab21fe269b930a159f3
title: adopt-puppy-pug-engine
type: adr
goal: Copy/adapt the Puggy implementation from /home/lagz0ne/dev/puggy into Tinkaria as a short-form HTML authoring path for rich-content embeds. [ASSUMED] /home/lagz0ne/dev/puggy is the intended source because /home/lagz0ne/dev/puppy does not exist on this machine.
status: implemented
date: "2026-04-15"
---

## Goal

Copy/adapt the Puggy implementation from /home/lagz0ne/dev/puggy into Tinkaria as a short-form HTML authoring path for rich-content embeds. [ASSUMED] /home/lagz0ne/dev/puggy is the intended source because /home/lagz0ne/dev/puppy does not exist on this machine.

Choice: use the pure TypeScript Puggy renderer in src/shared/puggy; expose `format: "pug"` and fenced `pug` blocks as shorthand for static/safe HTML; compile that shorthand to escaped HTML and reuse the sandboxed HTML iframe path. No external pug package or browser-side Node-compatible pug bundle is added.

Limitation: this is not a general Pug app engine. It is a convenience syntax to write less HTML in transcript artifacts. Expose the subset plainly: elements, selector shorthand, attributes, text/interpolation, simple conditionals/loops/mixins/virtual modules, and safety diagnostics. Do not advertise arbitrary JavaScript, filters, filesystem includes, or full Pug compatibility.

Work: copied parser/evaluator/diagnostics/html renderer; added pug to embed languages; added engine, EmbedRenderer, fenced markdown, and present_content tests; mapped src/shared/puggy/** to c3-204 and wired c3-107 to c3-204.

Verification: RED bun test src/shared/puggy/index.test.ts src/client/components/rich-content/EmbedRenderer.pug.test.tsx failed on missing engine and missing pug embed support. GREEN focused suite passed 89 tests. bunx @typescript/native-preview --noEmit -p tsconfig.json passed. bun run build passed. c3x check passed. Bundle guard found no pug-runtime/path-parse/pug-* traces in dist/client/assets. Browser smoke via chrome-devtools-axi loaded Vite, imported /src/shared/puggy/index.ts, rendered <main><h1>Browser Pug</h1></main> into sandboxed iframe allow-scripts; only expected 502s appeared because local backend was not running.
