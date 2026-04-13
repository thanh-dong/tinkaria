---
id: ref-session-discovery-internal-workflows
c3-seal: a25b6974616cf005683ab020fc8ec7122e0bdfa41743424a449d0fefe28ef29e
title: session-discovery-internal-workflows
type: ref
goal: Prevent Tinkaria-owned quick-response helper runs from appearing as resumable user session history.
---

## Goal

Prevent Tinkaria-owned quick-response helper runs from appearing as resumable user session history.

## Choice

Session discovery excludes provider CLI sessions whose first prompt matches Tinkaria internal workflow prompt signatures for fork prompt generation, merge prompt generation, or background title generation.

## Why

Those helper runs are implementation detail, not user work. Showing them in the session picker creates noise, misleading resumability, and confusing labels that look like product bugs.

## How

Normalize the discovered prompt/title text before classification. Treat prompts that start with `Write the first user message for a new independent forked coding session.`, `Write the first user message for a new session that merges context from`, or `Generate a short, descriptive title (under 30 chars) for a conversation that starts with this message.` as internal workflow sessions and skip them during CLI session scanning for both Claude and Codex history.
