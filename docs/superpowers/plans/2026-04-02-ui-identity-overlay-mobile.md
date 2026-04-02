# UI Identity Overlay Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky mobile inspect mode for the UI identity overlay, entered with a two-finger long press and dismissed explicitly.

**Architecture:** Extend the existing global overlay controller with a mobile-specific touch entry path and an explicit inspect-mode session state, while reusing the current tag taxonomy, ancestor stack, pointer/touch-origin placement, and selected-area halo. Mobile should share the same overlay rendering path as desktop, with only trigger, dismissal, and interaction suppression changing.

**Tech Stack:** React 19, TypeScript, Bun test, existing overlay controller in `App.tsx`, React DOM portal APIs, browser/mobile emulation for smoke testing

---

### Task 1: Add Mobile Inspect State Helpers

**Files:**
- Modify: `src/client/app/App.tsx`
- Test: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add pure helper tests in `src/client/app/App.test.tsx`:

```ts
import {
  getUiIdentityOverlayMobileLongPressDelayMs,
  shouldEnterUiIdentityMobileInspectMode,
} from "./App"

describe("getUiIdentityOverlayMobileLongPressDelayMs", () => {
  test("uses a deliberate two-finger long-press delay", () => {
    expect(getUiIdentityOverlayMobileLongPressDelayMs()).toBe(450)
  })
})

describe("shouldEnterUiIdentityMobileInspectMode", () => {
  test("requires exactly two touch points and a tagged target", () => {
    expect(shouldEnterUiIdentityMobileInspectMode({
      touchCount: 2,
      hasTaggedTarget: true,
    })).toBe(true)
    expect(shouldEnterUiIdentityMobileInspectMode({
      touchCount: 1,
      hasTaggedTarget: true,
    })).toBe(false)
    expect(shouldEnterUiIdentityMobileInspectMode({
      touchCount: 2,
      hasTaggedTarget: false,
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/App.test.tsx`
Expected: FAIL because the new mobile helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add pure helpers to `src/client/app/App.tsx`:

```ts
const UI_IDENTITY_OVERLAY_MOBILE_LONG_PRESS_DELAY_MS = 450

export function getUiIdentityOverlayMobileLongPressDelayMs() {
  return UI_IDENTITY_OVERLAY_MOBILE_LONG_PRESS_DELAY_MS
}

export function shouldEnterUiIdentityMobileInspectMode(args: {
  touchCount: number
  hasTaggedTarget: boolean
}) {
  return args.touchCount === 2 && args.hasTaggedTarget
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/App.tsx src/client/app/App.test.tsx
git commit -m "feat: add mobile overlay inspect helpers"
```

### Task 2: Add Sticky Mobile Inspect Mode To The Overlay Controller

**Files:**
- Modify: `src/client/app/App.tsx`
- Test: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add focused controller-state helper tests:

```ts
import {
  createUiIdentityOverlayMobileState,
  reduceUiIdentityOverlayMobileState,
} from "./App"

describe("reduceUiIdentityOverlayMobileState", () => {
  test("enters sticky inspect mode on confirmed mobile trigger and exits on explicit dismiss", () => {
    const entered = reduceUiIdentityOverlayMobileState(
      createUiIdentityOverlayMobileState(),
      { type: "enter", targetId: "chat.page" }
    )

    expect(entered).toEqual({
      active: true,
      targetId: "chat.page",
    })

    expect(reduceUiIdentityOverlayMobileState(entered, { type: "dismiss" })).toEqual({
      active: false,
      targetId: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/App.test.tsx`
Expected: FAIL because the mobile state helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a small explicit mobile-mode state helper layer:

```ts
interface UiIdentityOverlayMobileState {
  active: boolean
  targetId: string | null
}

type UiIdentityOverlayMobileAction =
  | { type: "enter"; targetId: string | null }
  | { type: "retarget"; targetId: string | null }
  | { type: "dismiss" }

export function createUiIdentityOverlayMobileState(): UiIdentityOverlayMobileState {
  return { active: false, targetId: null }
}

export function reduceUiIdentityOverlayMobileState(
  state: UiIdentityOverlayMobileState,
  action: UiIdentityOverlayMobileAction,
): UiIdentityOverlayMobileState {
  switch (action.type) {
    case "enter":
      return { active: true, targetId: action.targetId }
    case "retarget":
      return state.active ? { ...state, targetId: action.targetId } : state
    case "dismiss":
      return { active: false, targetId: null }
  }
}
```

Then wire `UiIdentityOverlayController()` to:
- track mobile inspect mode separately from desktop modifier mode
- treat overlay `active` as `desktopActive || mobileInspectActive`
- keep the overlay open after touch release when mobile inspect mode is active
- dismiss on explicit outside-click / close action only

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/App.tsx src/client/app/App.test.tsx
git commit -m "feat: add sticky mobile overlay mode"
```

### Task 3: Add Two-Finger Long-Press Entry

**Files:**
- Modify: `src/client/app/App.tsx`
- Test: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add event-binding tests for touch entry:

```ts
describe("bindUiIdentityOverlayWindowEvents", () => {
  test("starts mobile inspect mode after a two-finger long press on a tagged target", () => {
    // fake-window touchstart/touchend timers
    // expected: mobile enter callback fires once after delay
  })
})
```

Concrete expectation to assert:
- two-finger touch on tagged target schedules entry
- releasing early cancels entry
- one-finger touch never schedules entry

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/App.test.tsx`
Expected: FAIL because touch entry bindings do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Extend the existing window-binding seam with touch events:

```ts
type UiIdentityOverlayTouchLike = {
  touches: ArrayLike<unknown>
  target: EventTarget | null
  clientX?: number
  clientY?: number
}
```

Behavior:
- on `touchstart`, if there are two touches and the nearest target resolves to a tagged element, start a timeout using `UI_IDENTITY_OVERLAY_MOBILE_LONG_PRESS_DELAY_MS`
- on timeout, set mobile inspect mode active and set the target/pointer position from the touch origin
- on `touchend`, `touchcancel`, or mismatched touch count before the timeout, cancel the pending entry

Keep this as a true external-boundary effect in the existing window listener binding.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/App.tsx src/client/app/App.test.tsx
git commit -m "feat: add mobile overlay long press trigger"
```

### Task 4: Add Mobile Dismissal And Safe Interaction Blocking

**Files:**
- Modify: `src/client/components/ui/UiIdentityOverlay.tsx`
- Modify: `src/client/components/ui/UiIdentityOverlay.test.tsx`
- Modify: `src/client/app/App.tsx`
- Modify: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add focused overlay render tests:

```ts
describe("UiIdentityOverlay", () => {
  test("renders a visible close affordance in mobile inspect mode", () => {
    // render with mobile mode prop
    // expect close affordance markup
  })
})
```

Add controller dismissal tests:

```ts
describe("mobile inspect dismissal", () => {
  test("dismisses on outside interaction and close action", () => {
    // state helper or binder-level test
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx`
Expected: FAIL because the mobile dismiss affordance and dismissal handling do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Update `UiIdentityOverlay` to accept:
- `mobileMode: boolean`
- `onDismiss: () => void`

In mobile mode:
- render a close pill/button inside the panel header or top row
- render a dismissible backdrop hit area outside the panel

In `App.tsx`:
- when mobile inspect mode is active, outside-pointer/touch interactions dismiss instead of routing through underlying navigation
- explicit dismiss clears mobile state and pointer target/highlight

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ui/UiIdentityOverlay.tsx src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.tsx src/client/app/App.test.tsx
git commit -m "feat: add mobile overlay dismissal"
```

### Task 5: Verify Mobile Behavior And Update Handoff

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run the targeted verification set**

Run:

```bash
bun test src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.test.tsx
bun run build
bunx @typescript/native-preview --noEmit -p tsconfig.json
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected:
- targeted tests PASS
- build PASS
- native TypeScript check either PASS or the known pre-existing `baseUrl` failure is unchanged and documented
- `c3x check` PASS

- [ ] **Step 2: Run browser/device-emulation smoke test**

Run a mobile-viewport smoke test with `agent-browser`:

```bash
agent-browser open http://localhost:5174/chat/<known-chat-id>
agent-browser snapshot -i -c
```

Verify:
- two-finger long press enters inspect mode on a tagged chat surface
- inspect mode remains open after touch release
- tapping overlay rows copies ids
- tapping outside dismisses inspect mode
- close affordance dismisses inspect mode
- selected-area halo remains visible while active

- [ ] **Step 3: Update handoff**

Record in `tasks/todo.md`:
- mobile inspect mode implemented
- exact verification commands run
- browser/device-emulation findings
- remaining follow-up items if any

- [ ] **Step 4: Commit**

```bash
git add tasks/todo.md
git commit -m "docs: record mobile overlay verification"
```

## Self-Review

Spec coverage:
- two-finger long-press entry is implemented in Task 3.
- sticky inspect mode is implemented in Task 2.
- explicit dismissal and touch-safe interaction blocking are implemented in Task 4.
- verification and handoff updates are covered in Task 5.

Placeholder scan:
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes concrete files, code, commands, and expected outcomes.

Type consistency:
- Shared names remain `getUiIdentityOverlayMobileLongPressDelayMs()`, `shouldEnterUiIdentityMobileInspectMode()`, `reduceUiIdentityOverlayMobileState()`, and `bindUiIdentityOverlayWindowEvents()`.
