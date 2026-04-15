---
id: adr-20260415-process-queued-messages-background
c3-seal: 51769bd17bd8030841f61388f6db98b763f0d0bfb7378296c9b0cc4beccb241f
title: process-queued-messages-background
type: adr
goal: Queued chat messages should continue processing when the user is not active on the visible screen. The send/queue lifecycle must move out of frontend-only visibility-dependent execution and into a background-capable owner so queued work is not blocked by tab focus, route activity, or screen presence.
status: implemented
date: "2026-04-15"
---

## Goal
