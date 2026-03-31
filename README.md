<p align="center">
  <img src="assets/icon.png" alt="Kanna" width="80" />
</p> 

<h1 align="center">Kanna</h1>

<p align="center">
  <strong>A beautiful web UI for the Claude Code & Codex CLIs</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kanna-code"><img src="https://img.shields.io/npm/v/kanna-code.svg?style=flat&colorA=18181b&colorB=f472b6" alt="npm version" /></a>
</p>

<br />

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshot-light.png" />
    <img src="assets/screenshot.png" alt="Kanna screenshot" width="800" />
  </picture>
</p>

<br />

## Quickstart

```bash
bun install -g kanna-code
```

If Bun isn't installed, install it first:

```bash
curl -fsSL https://bun.sh/install | bash
```

Then run from any project directory:

```bash
kanna
```

That's it. Kanna opens in your browser at [`localhost:3210`](http://localhost:3210).

## Features

- **Multi-provider support** — switch between Claude and Codex (OpenAI) from the chat input, with per-provider model selection, reasoning effort controls, and Codex fast mode
- **NATS messaging backbone** — embedded NATS server with pub/sub snapshots, JetStream event persistence, and request-reply commands replacing raw WebSocket routing
- **Project-first sidebar** — chats grouped under projects, with live status indicators (idle, running, waiting, failed)
- **Drag-and-drop project ordering** — reorder project groups in the sidebar with persistent ordering
- **Local project discovery** — auto-discovers projects from both Claude and Codex local history
- **Rich transcript rendering** — hydrated tool calls, collapsible tool groups, plan mode dialogs, and interactive prompts with full result display
- **Embedded terminals** — Bun native PTY with xterm.js rendering, streamed via NATS JetStream
- **Plan mode** — review and approve agent plans before execution
- **Persistent local history** — refresh-safe routes backed by JSONL event logs and compacted snapshots
- **Auto-generated titles** — chat titles generated in the background via Claude Haiku
- **Session resumption** — resume agent sessions with full context preservation

## Architecture

[![Architecture diagram](https://diashort.apps.quickable.co/e/e69a07ad)](https://diashort.apps.quickable.co/d/e69a07ad)

The browser connects directly to an **embedded NATS server** over WebSocket (token-authenticated). All communication flows through three NATS subject namespaces:

| Namespace | Pattern | Purpose |
|-----------|---------|---------|
| **Snapshots** | `kanna.snap.*` | Push-based state broadcasts (sidebar, chat, terminal, settings). Cached in a KV bucket for late-join recovery. |
| **Events** | `kanna.evt.*` | Persistent streams via JetStream — terminal output (5 min retention) and chat messages (30 min retention). Clients replay on reconnect. |
| **Commands** | `kanna.cmd.*` | Request-reply from browser → server. All mutations (send message, create terminal, open project) go through here. |

[![Message flow](https://diashort.apps.quickable.co/e/63f362f2)](https://diashort.apps.quickable.co/d/63f362f2)

**Key patterns:** Event sourcing (JSONL append-only logs + snapshot compaction). CQRS with separate write (event log) and read (derived snapshots) paths. Reactive broadcasting — the publisher pushes fresh snapshots on every state change, with dedup to skip unchanged payloads. Multi-provider agent coordination with tool gating for user-approval flows.

## Requirements

- [Bun](https://bun.sh) v1.3.5+
- A working [Claude Code](https://docs.anthropic.com/en/docs/claude-code) environment
- *(Optional)* [Codex CLI](https://github.com/openai/codex) for Codex provider support

Embedded terminal support uses Bun's native PTY APIs and currently works on macOS/Linux.

## Install

Install Kanna globally:

```bash
bun install -g kanna-code
```

If Bun isn't installed, install it first:

```bash
curl -fsSL https://bun.sh/install | bash
```

Or clone and build from source:

```bash
git clone https://github.com/lagz0ne/kanna.git
cd kanna
bun install
bun run build
```

## Usage

```bash
kanna                  # start with defaults (localhost only)
kanna --port 4000      # custom port
kanna --no-open        # don't open browser
kanna --share          # create a public share URL + terminal QR
```

Default URL: `http://localhost:3210`

### Network access (Tailscale / LAN)

By default Kanna binds to `127.0.0.1` (localhost only). Use `--host` to bind a specific interface, or `--remote` as a shorthand for `0.0.0.0`:

```bash
kanna --remote                     # bind all interfaces — browser opens localhost:3210
kanna --host dev-box               # bind to a specific hostname — browser opens http://dev-box:3210
kanna --host 192.168.1.x           # bind to a specific LAN IP
kanna --host 100.64.x.x            # bind to a specific Tailscale IP
```

When `--host <hostname>` is given, the browser opens `http://<hostname>:3210` automatically. Other machines on your network can connect to the same URL:

### Public share link

Use `--share` to create a temporary public `trycloudflare.com` URL and print a terminal QR code:

```bash
kanna --share
kanna --share --port 4000
```

`--share` is incompatible with `--host` and `--remote`. It does not open a browser automatically; instead it prints:

```text
QR Code:
...

Public URL:
https://<random>.trycloudflare.com

Local URL:
http://localhost:3210
```

## Development

```bash
bun run dev
```

The same `--remote` and `--host` flags can be used with `bun run dev` for remote development.
`--share` is also supported in dev mode and exposes the Vite client URL publicly:

```bash
bun run dev --share
bun run dev --port 3333 --share
```

In dev, `--port` sets the Vite client port and the backend runs on `port + 1`, so `bun run dev --port 3333 --share` publishes `http://localhost:3333`.
`--share` remains incompatible with `--host` and `--remote`.
Use `bun run dev --port 4000` to run the Vite client on `4000` and the backend on `4001`.

Or run client and server separately:

```bash
bun run dev:client   # http://localhost:5174
bun run dev:server   # http://localhost:5175
```

## Scripts

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `bun run build`      | Build for production         |
| `bun run check`      | Typecheck + build            |
| `bun run dev`        | Run client + server together |
| `bun run dev:client` | Vite dev server only         |
| `bun run dev:server` | Bun backend only             |
| `bun run start`      | Start production server      |

## Project Structure

```
src/
├── client/                React 19 UI layer
│   ├── app/               App router, pages, central state hook
│   │   ├── nats-socket.ts   NATS WebSocket client (subscribe, command, reconnect)
│   │   ├── socket-interface.ts  KannaTransport abstraction
│   │   └── useKannaState.ts     Central state hook wiring socket → React
│   ├── components/        Messages, chat chrome, terminals, sidebar, UI primitives
│   ├── hooks/             Theme, standalone mode detection
│   ├── stores/            Zustand stores (preferences, layout, input — localStorage-persisted)
│   └── lib/               Formatters, path utils, transcript hydration
├── server/                Bun backend
│   ├── cli.ts             CLI entry point & browser launcher
│   ├── cli-supervisor.ts  Process supervisor (restart loop for updates)
│   ├── cli-runtime.ts     CLI parsing, self-update, version detection
│   ├── server.ts          HTTP server + NATS initialization
│   ├── nats-bridge.ts     Embedded NATS server (TCP + WebSocket + JetStream)
│   ├── nats-auth.ts       Token generation for NATS authentication
│   ├── nats-publisher.ts  Snapshot broadcasting + JetStream event publishing
│   ├── nats-responders.ts Command handler (subscribes to kanna.cmd.>)
│   ├── nats-streams.ts    JetStream stream configuration (terminal + chat)
│   ├── agent.ts           AgentCoordinator (multi-provider turn management)
│   ├── codex-app-server.ts  Codex App Server JSON-RPC client
│   ├── provider-catalog.ts  Provider/model/effort normalization
│   ├── event-store.ts     JSONL persistence, replay & compaction
│   ├── read-models.ts     CQRS derived views (sidebar, chat, projects)
│   ├── terminal-manager.ts  Bun PTY + xterm.js serialization
│   ├── discovery.ts       Auto-discover projects from Claude & Codex history
│   └── events.ts          Event type definitions
└── shared/                Shared between client & server
    ├── types.ts           Core data types, transcript entries, provider catalog
    ├── protocol.ts        Command & subscription topic types
    ├── nats-subjects.ts   Subject naming (kanna.snap.* / kanna.evt.* / kanna.cmd.*)
    ├── compression.ts     gzip compress/decompress for NATS payloads
    ├── tools.ts           Tool call normalization and hydration
    ├── ports.ts           Port configuration
    └── branding.ts        App name, data directory paths
```

## Data Storage

All state is stored locally at `~/.kanna/data/`:

| File             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `projects.jsonl` | Project open/remove events                |
| `chats.jsonl`    | Chat create/rename/delete events          |
| `messages.jsonl` | Transcript message entries                |
| `turns.jsonl`    | Agent turn start/finish/cancel events     |
| `snapshot.json`  | Compacted state snapshot for fast startup |

Event logs are append-only JSONL. On startup, Kanna replays the log tail after the last snapshot, then compacts if the logs exceed 2 MB.

## Acknowledgments

This project is a fork of [**jakemor/kanna**](https://github.com/jakemor/kanna) — the original beautiful web UI for Claude Code. Huge thanks to [@jakemor](https://github.com/jakemor) for creating and open-sourcing it.

This fork diverges by integrating [NATS](https://nats.io) as the messaging backbone for real-time state distribution, which represents a fundamentally different architectural direction from the original WebSocket-only approach. Because of the scope of these changes, contributing them upstream wasn't practical — so this lives as a separate fork instead.

## License

[MIT](LICENSE)
