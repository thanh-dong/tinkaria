---
id: ref-zod-defensive-validation
c3-seal: b6007c20cefac2da89028566bb94fcc1499eae27b2a3ae89a8aa572f740b09bd
title: zod-defensive-validation
type: ref
goal: Validate external structured payloads with explicit schema parsing that preserves the original failure source instead of ad hoc shape checks or silent coercion.
---

## Goal

Validate external structured payloads with explicit schema parsing that preserves the original failure source instead of ad hoc shape checks or silent coercion.

## Choice

Use Zod schemas at external input boundaries. Parse with `safeParse` or `safeParseAsync`, keep the schema adjacent to the boundary adapter, reject unknown keys when the wire contract is strict, and return explicit error payloads that preserve the validation source instead of silently dropping fields.

## Why

This keeps runtime validation declarative, auditable, and aligned with the advertised contract. When parsing fails, downstream code can tell whether the source of error is malformed external input versus later business logic, which prevents false success states and silent data loss.

## How

Define a schema for the inbound payload, parse once at the boundary, branch on parse success, and propagate a stable error object that includes the schema source and issue details. Do not rewrite a validation failure into a synthetic success payload.
