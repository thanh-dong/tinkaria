---
id: adr-20260331-compress-nats-payloads
c3-seal: f7cd5887987c888ec477465f7ba691e344ca86a16e5fe0403b1a9c6f62960356
title: compress-nats-payloads
type: adr
goal: 'Fix `KV put failed: ''payload'' max_payload size exceeded` for large chat transcripts by adding transparent gzip compression at the NATS payload boundary. JSON compresses 10-20x, raising the effective ceiling from 8MB to ~80-160MB.'
status: proposed
date: "2026-03-31"
---

## Goal

Fix `KV put failed: 'payload' max_payload size exceeded` for large chat transcripts by adding transparent gzip compression at the NATS payload boundary. JSON compresses 10-20x, raising the effective ceiling from 8MB to ~80-160MB.
