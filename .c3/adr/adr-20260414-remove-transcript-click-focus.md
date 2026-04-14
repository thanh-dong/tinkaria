---
id: adr-20260414-remove-transcript-click-focus
c3-seal: 683f931e602ccde3758bde9609ed4b5f32d66482fcd7f5d01fe08b3c59143562
title: remove-transcript-click-focus
type: adr
goal: Remove any behavior where clicking the transcript message list focuses the chat composer input. Verify whether the current chat transcript surface forwards pointer interaction into the composer, then keep transcript clicks passive unless the user directly interacts with an input control.
status: proposed
date: "2026-04-14"
---

## Goal

Remove any behavior where clicking the transcript message list focuses the chat composer input. Verify whether the current chat transcript surface forwards pointer interaction into the composer, then keep transcript clicks passive unless the user directly interacts with an input control.
