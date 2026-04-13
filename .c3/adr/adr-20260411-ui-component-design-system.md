---
id: adr-20260411-ui-component-design-system
c3-seal: 470fb31e100ae55ca471dfbd9ec653b5e26e61b9a707dbcff01469840a23c938
title: ui-component-design-system
type: adr
goal: Codify Tinkaria's UI component usage and screen composition patterns as enforceable C3 rules, derived from the coordination panel refactor and existing design system primitives.
status: proposed
date: "2026-04-11"
---

## Goal

Codify Tinkaria's UI component usage and screen composition patterns as enforceable C3 rules, derived from the coordination panel refactor and existing design system primitives.

## Work Breakdown

- Create `rule-ui-component-usage`: enforce that all forms use `ui/Input`, `ui/Textarea`, `ui/Button`; no raw HTML inputs/textareas/buttons in feature components
- Create `ref-screen-composition-patterns`: document the panel, card, and page layout vocabulary (PanelHeader/PanelBody/PanelListItem for dense ops; Card/InfoCard for browse; PageHeader for route roots)
- Audit all client components for violations of the new rule
- Wire the rule to all client-side C3 components
- Fix discovered violations
## Risks

- Over-constraining: some raw elements are appropriate (e.g., `<select>` in dense forms, filter tab `<button>` pills)
- Need explicit carve-outs for intentional raw usage
