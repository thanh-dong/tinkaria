---
id: adr-20260413-improve-tab-switch-latency
c3-seal: 6d780788836ebf591a29699a17a3ce7aef7353fa05e27522a149282244d92145
title: improve-tab-switch-latency
type: adr
goal: Reduce the latency when switching to a different chat tab that already has a fully loaded session, prove the bottleneck with browser/runtime evidence, and implement the smallest client/server change that makes tab activation feel immediate without regressing session hydration or transcript correctness.
status: proposed
date: "2026-04-13"
---

## Goal

Reduce the latency when switching to a different chat tab that already has a fully loaded session, prove the bottleneck with browser/runtime evidence, and implement the smallest client/server change that makes tab activation feel immediate without regressing session hydration or transcript correctness.
