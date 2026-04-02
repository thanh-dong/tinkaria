# Kanna Server Handoff

Document the safe way to move an existing Kanna instance from one machine to another under the current architecture, with minimal downtime and no intentional data loss.

## Goal

Kanna currently persists state locally on the machine where it runs. The immediate need is not a persistence redesign; it is an operator runbook another session can follow to hand off a live Kanna installation between machines such as:

- laptop -> always-on server at night
- always-on server -> laptop the next morning

The target outcome is:

- only one Kanna instance is active at a time
- the standby machine can stay nearly up to date
- cutover is explicit, short, and reversible
- data loss is avoided by construction rather than by hope

## Current Architecture Facts

This runbook is based on the current codebase, not a hypothetical future design.

- Durable state lives under the Kanna data root:
  - prod: `~/.kanna`
  - dev: `~/.kanna-dev`
- The event store persists state in `data/` using:
  - `projects.jsonl`
  - `chats.jsonl`
  - `messages.jsonl`
  - `turns.jsonl`
  - `snapshot.json`
- Per-chat transcripts are also stored in `data/transcripts/`.
- On startup, Kanna replays local state from the event store and transcript files.
- Embedded NATS is recreated at runtime and is not the migration payload.

Relevant code references:

- [src/server/event-store.ts](/home/lagz0ne/dev/kanna/src/server/event-store.ts)
- [src/server/server.ts](/home/lagz0ne/dev/kanna/src/server/server.ts)
- [src/shared/branding.ts](/home/lagz0ne/dev/kanna/src/shared/branding.ts)
- [README.md](/home/lagz0ne/dev/kanna/README.md#L231)

## Recommendation

Use assisted single-writer handoff.

This means:

1. Exactly one machine is `active`.
2. The other machine is `standby`.
3. The standby machine may receive warm background syncs of the Kanna data root.
4. Promotion only happens after the current active machine is stopped.
5. A final sync runs after stop and before target start.

This is the best fit for the current architecture because persistence is local-file based. It avoids split-brain without requiring a persistence redesign.

## Non-Goals

- No centralization of NATS as part of this handoff.
- No attempt to keep two Kanna servers writable at once.
- No true migration of a live agent process between machines.
- No unattended automatic failover.

## Operating Model

### Roles

- `active`: the only machine allowed to run Kanna
- `standby`: holds a synced copy of the active machine's Kanna data root and remains stopped

### Source Of Truth

The source of truth is the active machine's Kanna data root, not the transport layer.

### Sync Strategy

- Use Mutagen or `rsync` for warm sync if desired.
- Warm sync is only a speed optimization.
- Correctness comes from the final stop -> final sync -> promote sequence.

## Canonical Handoff Procedure

This is the procedure another session should operationalize and document as commands/scripts.

### Phase 1: Identify Active Context

Before copying anything:

1. Confirm whether the environment is prod (`~/.kanna`) or dev (`~/.kanna-dev`).
2. Confirm which machine is currently `active`.
3. Confirm the target machine is `standby` and Kanna is not running there.

### Phase 2: Warm Sync Standby

While the active machine is still serving:

1. Sync the entire Kanna data root from active to standby.
2. Preserve file contents and timestamps.
3. Do not start Kanna on the standby machine yet.

Warm sync target:

```text
~/.kanna/
~/.kanna/data/
~/.kanna/data/transcripts/
```

or, for dev:

```text
~/.kanna-dev/
~/.kanna-dev/data/
~/.kanna-dev/data/transcripts/
```

### Phase 3: Controlled Cutover

This is the safety boundary.

1. Stop Kanna on the current active machine.
2. Confirm the process is fully stopped.
3. Run one final sync from old active to new active.
4. Start Kanna on the target machine.
5. Do not restart the source machine unless rollback is needed.

### Phase 4: Verification

After target start:

1. Check `GET /health` on the promoted machine.
2. Confirm Kanna starts without store reset or replay corruption warnings.
3. Confirm expected chats/projects are visible.
4. Open at least one recent chat with transcript history.
5. Treat the source machine as rollback standby until confidence is established.

## Verification Checklist

Another session should treat these as required evidence, not optional comfort checks.

### Process Checks

- Kanna is stopped on the old active machine before final sync.
- Kanna is stopped on the standby machine before promotion.
- Only one Kanna process is running after cutover.

### Data Checks

- The target data root exists.
- `data/snapshot.json` exists if it existed on source.
- `data/transcripts/` exists and contains transcript files.
- The JSONL files are present:
  - `projects.jsonl`
  - `chats.jsonl`
  - `messages.jsonl`
  - `turns.jsonl`

### Health Checks

- `/health` returns `ok: true`
- Kanna serves the UI
- The expected machine can open the desired project/chat state

### Behavioral Checks

- A known existing chat loads
- A new message can be sent on the new active machine
- No old machine is still accepting writes

## Rollback

If verification fails on the promoted machine:

1. Stop Kanna on the new machine immediately.
2. Do not continue writing there.
3. Restart Kanna on the original machine using its last known-good local data.
4. Reclassify the original machine as `active`.
5. Investigate before attempting another cutover.

Rollback should be fast because the original source is not modified after stop, except for the final sync outward.

## Failure Modes And Guardrails

### Dual Active

Risk:
Both machines run Kanna against diverging local copies.

Guardrail:
Promotion is forbidden until the current active machine is fully stopped.

### Partial Final Sync

Risk:
The standby copy is warm but missing the last writes.

Guardrail:
Always run a final sync after source stop.

### Wrong Data Root

Risk:
Syncing `~/.kanna-dev` when prod is in use, or vice versa.

Guardrail:
The runbook must explicitly identify the active runtime profile before any copy step.

### False Confidence From NATS

Risk:
Assuming NATS continuity implies persistence continuity.

Guardrail:
Do not treat embedded NATS state as a migration asset. Only the Kanna data root matters for handoff under the current design.

## Mutagen Guidance

Mutagen is appropriate as the warm-sync mechanism if:

- both machines are reachable
- reducing final cutover duration matters
- you want the standby machine to remain nearly current during the day

Mutagen is not the correctness mechanism. Even with Mutagen:

1. stop current active
2. run or confirm final sync
3. start promoted target

If the next session chooses not to use Mutagen, `rsync` is still valid for both warm sync and final sync.

## Suggested Deliverables For The Next Session

The next session should produce:

1. An operator runbook with exact commands for:
   - warm sync
   - stop source
   - final sync
   - start target
   - verify target
   - rollback
2. A small handoff script or Make targets if that reduces operator error.
3. A guardrail mechanism that makes dual-active startup less likely.

Examples of acceptable guardrails:

- a role file stored outside the synced runtime process state
- a startup wrapper that refuses to launch when the machine is not designated `active`
- an explicit `handoff promote` script that owns the stop/sync/start sequence

## Acceptance Criteria

This design is successful if another session can implement or document an operational handoff where:

- one machine starts as `active`
- the standby machine can be warmed continuously or periodically
- cutover requires a short maintenance window only for final sync and promote
- only one Kanna instance is active at any moment
- rollback is clear and fast

## Diagram

Cutover diagram:

- https://diashort.apps.quickable.co/d/84fa4ac7
