---
id: c3-119
c3-seal: 54d2ebd89a92ddd520abfeafdcbdd3e18e032949651630d09ddc2b4134c27ab8
title: transcript-renderer
type: component
category: feature
parent: c3-1
goal: 'Own transcript render interaction: virtualized render items, assistant answer detection, WIP/tool grouping, dedicated-tool boundaries, scroll measurement, and dispatch into message renderers.'
uses:
    - c3-106
    - c3-107
    - c3-111
    - c3-118
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

# transcript-renderer
## Goal

Own transcript render interaction: virtualized render items, assistant answer detection, WIP/tool grouping, dedicated-tool boundaries, scroll measurement, and dispatch into message renderers.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-1 |
| Role | Own transcript-renderer behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep transcript-renderer decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |
## Purpose

Provide durable agent-ready documentation for transcript-renderer so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before transcript-renderer behavior is changed. | ref-live-transcript-render-contract |
| Inputs | Accept only the files, commands, data, or calls that belong to transcript-renderer ownership. | ref-live-transcript-render-contract |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-live-transcript-render-contract |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-live-transcript-render-contract |
## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks transcript-renderer to deliver its documented responsibility. | ref-live-transcript-render-contract |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-live-transcript-render-contract |
| Alternate paths | When a request falls outside transcript-renderer ownership, hand it to the parent or sibling component. | ref-live-transcript-render-contract |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-live-transcript-render-contract |
## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-live-transcript-render-contract | ref | Governs transcript-renderer behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |
## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| transcript-renderer input | IN | Callers must provide context that matches the component goal and parent fit. | c3-1 boundary | c3x lookup plus targeted tests or review. |
| transcript-renderer output | OUT | Derived code, docs, and tests must preserve the documented behavior and governance. | c3-1 boundary | c3x check and project test suite. |
## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | Run c3x check and relevant project tests. |
| Governance drift | Cited references, rules, or parent responsibilities change. | Re-read Governance rows and parent container docs. | Run c3x verify plus targeted lookup for changed files. |
## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |
