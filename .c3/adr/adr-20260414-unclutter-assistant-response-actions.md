---
id: adr-20260414-unclutter-assistant-response-actions
c3-seal: cf2a3709b32f07df7563c17e6d8ec1dad976215d9c5473ce7288bb15909b68ac
title: unclutter-assistant-response-actions
type: adr
goal: Reduce transcript clutter in `message.assistant.response` by removing the card-like assistant response wrapper and showing row controls only on touch/mobile or hover for pointer devices while keeping the actions accessible.
status: proposed
date: "2026-04-14"
---

## Goal

Reduce transcript clutter in `message.assistant.response` by removing the card-like assistant response wrapper and showing row controls only on touch/mobile or hover for pointer devices while keeping the actions accessible.

## Context

The current assistant response presentation reads as a card and keeps action controls visible too often, which adds noise to the transcript. The requested change is scoped to the assistant response surface inside component `c3-111 (messages)`.

## Change

Adjust the assistant response wrapper styling to feel inline with the transcript instead of card-framed, and gate controller visibility so touch/mobile keeps access while pointer devices reveal controls on hover/focus.

## Verification

Run focused message/transcript tests, native typecheck, `c3x check`, and a browser smoke check covering desktop hover and mobile/touch visibility.
