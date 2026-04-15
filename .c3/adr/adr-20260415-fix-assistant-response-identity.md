---
id: adr-20260415-fix-assistant-response-identity
c3-seal: 0a737fe1db3aaab856f9182837d5eb75bcf0cc81fa8af076dfecc99265222700
title: fix-assistant-response-identity
type: adr
goal: Fix assistant response UI identity so surfaces under message.assistant.response no longer claim the parent c3-111 messages identity. Audit the C3 component/rule context, add focused regression coverage, update only affected descriptors, and verify with tests plus c3x check.
status: proposed
date: "2026-04-15"
---

## Goal

Fix assistant response UI identity so surfaces under message.assistant.response no longer claim the parent c3-111 messages identity. Audit the C3 component/rule context, add focused regression coverage, update only affected descriptors, and verify with tests plus c3x check.
