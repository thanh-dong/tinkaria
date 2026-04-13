---
id: rule-react-no-effects
c3-seal: f8990892daf4a60887ce9cd4d51face6d2a2cc1953d744356b7f9f5a50e41607
title: react-no-effects
type: rule
goal: Keep React components declarative by treating Effects as a last-resort escape hatch for external-system synchronization only, and by giving Tinkaria a concrete replacement path for each common Effect misuse.
---

## Goal

Keep React components declarative by treating Effects as a last-resort escape hatch for external-system synchronization only, and by giving Kanna a concrete replacement path for each common Effect misuse.

## Rule

In client React code, do not use `useEffect` or `useLayoutEffect` for derived data, cascading state updates, prop-to-state resets, or user-event workflows. Use this replacement matrix instead:

- render-time derivation for values computable from current props/state
- `useMemo` only for measured expensive pure calculations
- keyed remounts for identity resets
- event handlers for user-caused workflows
- Zustand for shared client/app UI state and local workflow state machines
- `useSyncExternalStore` or a dedicated adapter hook for external subscriptions
- TanStack Query only for pull-based remote server state if the dependency is adopted in the future
Effects are allowed only when synchronizing with an external system that exists outside React and cannot be expressed by the matrix above.

## Golden Example

```tsx
// 1. Derive during render instead of mirroring state with an Effect.
function ProfileName({ firstName, lastName }: { firstName: string; lastName: string }) {
  const fullName = `${firstName} ${lastName}`
  return <span>{fullName}</span>
}

// 2. Memoize only when the calculation is both pure and measured as expensive.
function VisibleSessions({ sessions, filter }: { sessions: Session[]; filter: string }) {
  const visibleSessions = useMemo(
    () => getFilteredSessions(sessions, filter),
    [sessions, filter]
  )
  return <SessionList sessions={visibleSessions} />
}

// 3. Reset local state by identity with a key, not an Effect.
function ChatRoute({ chatId }: { chatId: string }) {
  return <ChatComposer key={chatId} chatId={chatId} />
}

// 4. Put event-caused work in the event handler.
function SendButton({ send }: { send: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState("")

  async function handleSubmit() {
    await send(message)
    setMessage("")
  }

  return <button onClick={handleSubmit}>Send</button>
}

// 5. Shared client state belongs in a store, not in effect-driven mirror state.
type ChatQueueStore = {
  queuedTextByChat: Record<string, string>
  queue(chatId: string, content: string): void
  clear(chatId: string): void
}

export const useChatQueueStore = create<ChatQueueStore>((set) => ({
  queuedTextByChat: {},
  queue: (chatId, content) => set((state) => ({
    queuedTextByChat: {
      ...state.queuedTextByChat,
      [chatId]: state.queuedTextByChat[chatId]
        ? `${state.queuedTextByChat[chatId]}\n\n${content}`
        : content,
    },
  })),
  clear: (chatId) => set((state) => {
    const next = { ...state.queuedTextByChat }
    delete next[chatId]
    return { queuedTextByChat: next }
  }),
}))

// 6. External subscriptions use an explicit subscription boundary.
function useSocketStatus(socket: KannaTransport) {
  return useSyncExternalStore(socket.onStatus, socket.getStatus, socket.getStatus)
}

// 7. If we later add TanStack Query, reserve it for remote server state.
function useReleasesQuery() {
  return useQuery({
    queryKey: ["github-releases"],
    queryFn: fetchGithubReleases,
    staleTime: 5 * 60 * 1000,
  })
}
```
Repo-specific interpretation:

- Zustand is the default home for shared browser-side state that outlives one component or coordinates multiple components.
- `useSyncExternalStore` is preferred when adapting subscriptions from sockets, media queries, browser APIs, or other external emitters.
- TanStack Query is not a generic state manager. If adopted later, it owns fetch/cache/invalidate flows for pull-based HTTP-style server state, not NATS push state or purely local UI state.
Boundary-only synchronization examples that may still justify an Effect or layout effect in a dedicated adapter hook/component:

- subscribing to browser APIs that do not provide a React-native subscription primitive
- attaching and disposing imperative third-party widgets
- measuring or mutating layout when render-time CSS/HTML cannot express the behavior
- owning the lifecycle of an imperative subsystem such as xterm.js
Every allowed Effect must answer all of these:

1. What external system is being synchronized?
2. Why can this not be expressed during render, by a key, in an event handler, in Zustand, or via a subscription API?
3. What cleanup restores symmetry on unmount or dependency change?
## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| useEffect(() => setFiltered(getFiltered(items, query)), [items, query]) | const filtered = getFiltered(items, query) or useMemo(...) | Mirrors derived data into state and forces an extra render pass |
| useEffect(() => setDraft(""), [chatId]) | Remount the stateful subtree with key={chatId} | Resets after commit instead of making identity explicit |
| useEffect(() => { if (shouldSubmit) post(payload) }, [shouldSubmit, payload]) | Call post(payload) directly in the submit handler | Event-specific logic belongs to the event that caused it |
| chained Effects that each update the next state variable | Calculate next state in one event handler, reducer, or Zustand action | Creates fragile cascading renders and temporal coupling |
| component-local Effect subscriptions for shared app state | useSyncExternalStore, Zustand selectors, or an adapter hook with one subscription boundary | Reimplements store wiring in every component and hides ownership |
| using TanStack Query for local dialog state, socket push state, or composer drafts | use component state, Zustand, or useSyncExternalStore depending on ownership | Query libraries solve remote server-state caching, not local UI orchestration |
| layout/focus Effect in a feature component when CSS, refs, or a focused adapter hook can handle it | move imperative DOM sync behind a dedicated adapter hook/component | Keeps imperative escape hatches localized and reviewable |
## Scope

Applies to all browser React modules under `src/client/**/*.ts` and `src/client/**/*.tsx`, including hooks. Today, Kanna already uses Zustand and does not ship TanStack Query. Until that changes, pull-based remote server state should stay in explicit fetch helpers or be introduced alongside a deliberate Query adoption decision.

## Override

An override is allowed only for true external-system synchronization. Keep it in the smallest possible adapter hook or boundary component, document the external system in a short comment above the Effect, and prefer `useLayoutEffect` only when DOM measurement or pre-paint mutation is strictly required. If the code is responding to a user action, deriving data from existing state/props, repairing local state after render, or modeling browser-side workflow state, the override is invalid.
