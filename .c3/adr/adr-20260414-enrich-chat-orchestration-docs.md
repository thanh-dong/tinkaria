---
id: adr-20260414-enrich-chat-orchestration-docs
c3-seal: b0b8a5989627da44575f58f299c202638cc4abd54107708d5acdd15f5028e58b
title: enrich-chat-orchestration-docs
type: adr
goal: Enrich c3-110 (chat), c3-112 (chat-input), and c3-206 (orchestration) with detailed documentation covering scroll state machine, read signals, message submit pipeline with queuing, keyboard behaviors, subagent delegation lifecycle, fork/merge flows, and cancellation cascades.
status: proposed
date: "2026-04-14"
---

## Goal

Enrich c3-110 (chat), c3-112 (chat-input), and c3-206 (orchestration) with detailed documentation covering scroll state machine, read signals, message submit pipeline with queuing, keyboard behaviors, subagent delegation lifecycle, fork/merge flows, and cancellation cascades.

## Context

These three components own the primary interaction layer: how users send messages, how scroll tracks live content, when chats mark as read, how subagents spawn and cascade, and how fork/merge sessions seed new chats. Current docs describe goals and deps but lack the operational detail that prevents regressions and onboarding friction.

## Decision

Add detailed body sections to c3-110 (scroll machine states, read signal, submit pipeline, fork/merge flow), c3-112 (keyboard matrix, queue vs submit UX, draft persistence), and c3-206 (MCP tools, depth/concurrency limits, cancellation cascade, delegated context algorithm). Create diagrams for scroll state machine, submit pipeline, and orchestration hierarchy.
