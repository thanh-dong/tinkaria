---
id: c3-215
c3-seal: 8793db9582dd9e9944cfee941404a7197842ab01bd889a6dd3957b66ac024e9e
title: share
type: component
category: feature
parent: c3-2
goal: Cloudflared tunnel integration for sharing Kanna sessions publicly via a temporary URL, with QR code generation for easy mobile access.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

Cloudflared tunnel integration for sharing Kanna sessions publicly via a temporary URL, with QR code generation for easy mobile access.

## Dependencies

- cloudflared npm package (Tunnel.quick, bin path, install)
- qrcode npm package (QRCode.toString for terminal rendering)
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-error-extraction |  |
| rule-bun-test-conventions |  |
| rule-prefixed-logging |  |
## Container Connection

Part of c3-2 (server). Activated by the CLI (c3-203) --share flag to expose the local Kanna instance over a public cloudflared tunnel.
