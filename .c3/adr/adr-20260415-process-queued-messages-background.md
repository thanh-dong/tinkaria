---
id: adr-20260415-process-queued-messages-background
c3-seal: 226c3c23a80923e63c6837c94fabcfafdd684c2b51e60730b3a1ba9c51a4bcf6
title: process-queued-messages-background
type: adr
goal: Move queued chat message processing to a background-capable owner so queued work is not blocked by tab focus, route activity, or screen presence.
status: implemented
date: "2026-04-15"
---

## Goal

Move queued chat message processing to a background-capable owner so queued work is not blocked by tab focus, route activity, or screen presence.
