# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the known pre-release verification blockers on the full Tinkaria release surface so the branch can be validated as a single release candidate.

**Architecture:** Treat this as release hardening rather than feature work. Fix deterministic verification failures first, then isolate and stabilize the flaky NATS bridge path with the smallest code or test change that addresses the root cause, then rerun the full release verification stack.

**Tech Stack:** Bun, TypeScript native preview compiler, embedded NATS, Bun test, Vite

---

### Task 1: Native TypeScript Check

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Reproduce the failure**

Run: `bunx @typescript/native-preview --noEmit -p tsconfig.json`
Expected: FAIL on `tsconfig.json` with `Option 'baseUrl' has been removed`.

- [ ] **Step 2: Remove the deprecated option without broadening config scope**

Edit `tsconfig.json` to remove `compilerOptions.baseUrl`.

- [ ] **Step 3: Re-run the native TypeScript check**

Run: `bunx @typescript/native-preview --noEmit -p tsconfig.json`
Expected: PASS, or a new concrete repo-level error that replaces the deprecated-option failure.

### Task 2: NATS Bridge Timeout

**Files:**
- Modify: `src/server/nats-bridge.test.ts`
- Modify: `src/server/nats-bridge.ts`

- [ ] **Step 1: Reproduce the focused failure**

Run: `bun test src/server/nats-bridge.test.ts`
Expected: Either FAIL or intermittently hang/time out in `publish() delivers message to subscriber`.

- [ ] **Step 2: Add the smallest failing test or assertion needed to expose the root cause**

Prefer proving subscriber readiness or publish flushing explicitly rather than layering sleeps blindly.

- [ ] **Step 3: Implement the minimal root-cause fix**

Adjust the test or bridge behavior only where needed to make publish delivery deterministic.

- [ ] **Step 4: Re-run the focused NATS test**

Run: `bun test src/server/nats-bridge.test.ts`
Expected: PASS.

### Task 3: Full Release Verification

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run full verification**

Run:
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `bun test`
- `bun run build`

Expected: all PASS.

- [ ] **Step 2: Record evidence**

Update `tasks/todo.md` with the blocker fixes, verification output, and any remaining release prep work such as version bump and publish sequencing.
