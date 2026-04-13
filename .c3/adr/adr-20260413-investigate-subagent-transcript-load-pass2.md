---
id: adr-20260413-investigate-subagent-transcript-load-pass2
c3-seal: f85e3c5e43c51beadbc2ef3924ba53d06ce9413471bad34f9fbc888a595fd2d9
title: investigate-subagent-transcript-load-pass2
type: adr
goal: Reproduce the still-failing subagent transcript load issue on the deployed app and fix the actual remaining root cause.
status: proposed
date: "2026-04-13"
---

## Goal

Reproduce the still-failing subagent transcript load issue on the deployed app and fix the actual remaining root cause.

## Context

A first fix was shipped, but the user reports the subagent transcript surface still says it cannot be loaded.

## Change

Use the live browser surface plus code tracing to identify the remaining failure path, then implement and verify the narrowest fix.

## Affected

- c3-110
- c3-112
