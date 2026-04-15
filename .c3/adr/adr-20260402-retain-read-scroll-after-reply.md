---
id: adr-20260402-retain-read-scroll-after-reply
c3-seal: 543d6f6feeb2c540c51df24439ca7c0ea983d9d844100ca594d1ef33e6ea9945
title: Retain read scroll position after reply
type: adr
goal: Persist the current latest-message read watermark when the user successfully replies in an existing chat so switching away and back retains the newer end of the transcript.
status: implemented
date: "2026-04-02"
---

# Retain read scroll position after reply
## Goal

Persist the current latest-message read watermark when the user successfully replies in an existing chat so switching away and back retains the newer end of the transcript.
