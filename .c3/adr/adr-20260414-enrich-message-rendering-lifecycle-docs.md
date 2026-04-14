---
id: adr-20260414-enrich-message-rendering-lifecycle-docs
c3-seal: 43c7558049bbd988e03c1f1d18cb3d0afd71857165f72b21ceddde1836655a96
title: enrich-message-rendering-lifecycle-docs
type: adr
goal: Enrich the three core message-rendering component docs (c3-118 transcript-lifecycle, c3-119 transcript-renderer, c3-111 messages) with detailed lifecycle phases, algorithm walkthroughs, component inventories, and cross-boundary contract explanations so any contributor can understand the full data-to-pixel pipeline without reading source.
status: proposed
date: "2026-04-14"
---

## Goal

Enrich the three core message-rendering component docs (c3-118 transcript-lifecycle, c3-119 transcript-renderer, c3-111 messages) with detailed lifecycle phases, algorithm walkthroughs, component inventories, and cross-boundary contract explanations so any contributor can understand the full data-to-pixel pipeline without reading source.

## Context

Current component docs describe goals and dependencies but lack the operational detail needed to reason about the rendering lifecycle. Contributors touching this area repeatedly need to re-read source to understand cache restore order, hydration mutation semantics, WIP grouping algorithm, answer detection heuristics, and the 17-component message dispatch table. This ADR enriches existing docs with that detail and adds diagrams.

## Decision

Add detailed body sections to c3-118, c3-119, and c3-111 covering lifecycle phases, algorithms, component inventories, and semantic UI identity maps. Create a diashort end-to-end lifecycle diagram linked from all three.
