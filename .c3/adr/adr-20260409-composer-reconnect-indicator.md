---
id: adr-20260409-composer-reconnect-indicator
c3-seal: 335e6d658c14a16e580c0d8c8abb64ddb66a07aaa38c53cd7150b94a3d91b8be
title: composer-reconnect-indicator
type: adr
goal: Move reconnect feedback from the transcript stack into the chat composer area, using an orange reconnect pulse and a green success fade before composer actions become active again. Keep generic transcript errors visible, but suppress connection-recovery copy there while the socket is offline so the reconnection contract stays scoped to `c3-112`.
status: implemented
date: "2026-04-09"
---

## Goal

Move reconnect feedback from the transcript stack into the chat composer area, using an orange reconnect pulse and a green success fade before composer actions become active again. Keep generic transcript errors visible, but suppress connection-recovery copy there while the socket is offline so the reconnection contract stays scoped to `c3-112`.
