# Tinkaria

Web UI for Claude Code and Codex CLIs. Full-stack TypeScript: React 19 client + Bun HTTP/WebSocket server.

## Work From C3

C3 is the architecture source of truth and the project work harness. Do not rediscover project structure or pre-triage C3's scope yourself.

- Send project questions, file paths, audits, impact checks, rules, refs, plans, and implementation work to `$c3`.
- Let C3 classify the operation and provide topology, ownership, rules, refs, recipes, ADRs, and file context.
- Read or edit source only after C3 has returned the relevant context and next steps.
- If C3 is unavailable or check fails, stop and report the blocker instead of bypassing it.
- Keep this file brief; durable architecture and coding rules belong in `.c3/`.

## Verification

- Use Bun, not npm/yarn.
- Use `bunx @typescript/native-preview --noEmit -p tsconfig.json` for typecheck.
- Use focused `bun test ...` for changed behavior, then broader tests as risk demands.
- Run `git diff --check` before finishing.
