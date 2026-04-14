---
id: c3-215
c3-seal: cd12d4c0a203e3cafff205f7620ca32a65d4a1cca3096a0e9371cbe92ee465e1
title: share
type: component
category: feature
parent: c3-2
goal: Cloudflared tunnel integration for sharing Tinkaria sessions publicly via a temporary URL, with QR code generation for easy mobile access.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

Cloudflared tunnel integration for sharing Tinkaria sessions publicly via a temporary URL, with QR code generation for easy mobile access.

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

Part of c3-2 (server). Activated by the CLI (c3-203) --share flag to expose the local Tinkaria instance over a public cloudflared tunnel.
