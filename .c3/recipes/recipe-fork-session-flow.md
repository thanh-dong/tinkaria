---
id: recipe-fork-session-flow
c3-seal: 30650607e9a092f0e0e81b5f1e9d33b3f2178cd67dab3a59dbda9edba4e0f9d9
title: fork-session-flow
type: recipe
goal: Trace the end-to-end fork flow from chat workspace input to a new independently seeded chat.
---

## Goal

Trace the end-to-end fork flow from chat workspace input to a new independently seeded chat.

The owning browser surface is `c3-110 chat`, while the command path runs through `c3-205 nats-transport`.

Flow:

1. User opens the fork dialog from the active chat workspace.
2. User selects a preset scaffold and edits the fork intent text.
3. Client sends `chat.generateForkPrompt` with the source chat id, the edited intent, and the selected preset id.
4. Server derives a bounded source-transcript excerpt and generates a fork seed prompt.
5. Client creates a new chat and sends the generated prompt as the first message.
6. The forked chat starts as an independent session with no ongoing orchestration link back to the source chat.
