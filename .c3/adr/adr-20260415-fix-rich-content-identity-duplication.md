---
id: adr-20260415-fix-rich-content-identity-duplication
c3-seal: df22e97094cab3c8ff583d230f7f0f0ff1b3b1545d5bc2addc277ac749b5e2d1
title: fix-rich-content-identity-duplication
type: adr
goal: Fix the duplication regression after adding rich-content identity inside assistant responses. Prove whether the duplicate is rendered content or duplicated Alt+Shift identity stack, add focused regression coverage, keep C3 identity ownership correct, and verify with tests plus c3x check.
status: proposed
date: "2026-04-15"
---

## Goal

Fix the duplication regression after adding rich-content identity inside assistant responses. Prove whether the duplicate is rendered content or duplicated Alt+Shift identity stack, add focused regression coverage, keep C3 identity ownership correct, and verify with tests plus c3x check.
