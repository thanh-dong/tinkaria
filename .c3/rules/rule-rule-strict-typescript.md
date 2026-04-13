---
id: rule-rule-strict-typescript
c3-seal: e9737e10a967a71de47f9633c9df4aa1989dbd1ce3a38bf817972fbf85bb4784
title: rule-strict-typescript
type: rule
goal: Catch errors at compile time and maintain self-documenting code through strict TypeScript configuration.
---

## Goal

Catch errors at compile time and maintain self-documenting code through strict TypeScript configuration.

## Rule

TypeScript strict mode enabled. No `any` types. All function parameters and return types must be explicit or inferrable by the compiler.

## Golden Example

```typescript
// Explicit types on public API boundaries
function processMessage(message: ChatMessage): ProcessedResult {
  const tokens = tokenize(message.content); // return type inferred
  return { tokens, timestamp: Date.now() };
}

// Discriminated unions over loose types
type WebSocketMessage =
  | { topic: "chat"; payload: ChatPayload }
  | { topic: "terminal"; payload: TerminalPayload }
  | { topic: "sidebar"; payload: SidebarPayload };

// Generic constraints over any
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}
```
## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| function handle(data: any) | function handle(data: ChatMessage) | any defeats type checking entirely |
| JSON.parse(str) as any | JSON.parse(str) as unknown then validate | any propagates unsafety through the call chain |
| // @ts-ignore | Fix the actual type error | Suppressing errors hides real bugs |
| Record<string, any> | Record<string, unknown> or specific type | any values escape all checking |
## Scope

All TypeScript files in both server and client packages. Type assertions (`as`) are acceptable when narrowing from `unknown` after validation.

## Override

Only in test files where mocking requires partial types, and only with `as unknown as T` pattern, never raw `any`.
