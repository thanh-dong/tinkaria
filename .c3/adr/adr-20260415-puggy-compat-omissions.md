---
id: adr-20260415-puggy-compat-omissions
c3-seal: ad3f55b4ea543846e1d291c14b65bdf9ea73f25041f3babc128490acb391cbdf
title: puggy-compat-omissions
type: adr
goal: Make Puggy tolerate low-value full-Pug/document constructs by omitting them where safe, while preserving CSS block text in sandboxed output. Verify with focused tests for document wrappers, comments, meta omission, inline style attr omission, and `style.` CSS preservation.
status: proposed
date: "2026-04-15"
---

## Goal

Make Puggy tolerate low-value full-Pug/document constructs by omitting them where safe, while preserving CSS block text in sandboxed output. Verify with focused tests for document wrappers, comments, meta omission, inline style attr omission, and `style.` CSS preservation.
