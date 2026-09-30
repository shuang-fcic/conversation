---
name: update-spec
description: Update an existing feature spec under specs/<feature-name>/ (requirements.md / design.md / tasks.md) in place, following the project's spec conventions — edit to reflect today's desired behaviour, keep requirement numbers append-only, and check for knock-on impact to other specs. Use when asked to "update the spec", "revise the spec", "the spec is out of date", "add a requirement", or "sync the spec with the code".
---

# Update Spec Skill

Edit an existing feature spec so it once again describes the feature **as it should behave today**. The spec files are *living documents*: you edit them **in place** — never append "delta"/changelog/"new in v2" sections, and never renumber requirements. History lives in git.

## Step 1 — Identify the target and the change

- Which feature (`specs/<feature>/`)? Take it from the user or the open file.
- What's driving the update? Typically one of:
  - **New/changed requirement** — behaviour is being added or altered.
  - **Design change** — the HOW changed (refactor, new component, different approach).
  - **Sync-with-code** — the spec drifted from what's actually built; make the doc honest.
  - **Retire** — a requirement no longer applies.

Read all three files plus [specs/README.md](../../../specs/README.md) for the conventions before editing.

## Step 2 — Apply the edits in place

### requirements.md
- **Add** a requirement → append the **next** `Rn` number (append-only). Never insert-and-shift.
- **Change** a requirement → edit its text/acceptance criteria in place so it reads as today's truth. Keep its number.
- **Retire** a requirement → mark it `**Deprecated**` in place (keep the number and a one-line why). Never delete-and-renumber — that silently breaks every `Rn` reference below it.
- Keep acceptance criteria **EARS-style** (`WHEN … THEN … SHALL`, `THE … SHALL`) and testable.

### design.md
- Update the affected `## Components` / `## Architecture` / `## Decisions` to match, keeping repo-relative code links (`../../backend/src/...`) accurate.
- Ensure every `Rn` (including new ones) is traceable from the design.
- Honour [AGENTS.md](../../../AGENTS.md) conventions; flag anything now at odds with the distributed-system stance.

### tasks.md
- If this update kicks off an implementation iteration, rewrite `tasks.md` to that iteration's checklist (tied to the `Rn`s, concrete files, a Verification group). If it's a pure doc-sync with no pending work, leave/clear it accordingly.

### Both requirements.md & design.md headers
- Bump `**Last updated:** YYYY-MM-DD` (today).
- Adjust `Status` if warranted (`Draft`/`Active`/`Deprecated`).

## Step 3 — Cross-spec impact analysis (required)

A spec rarely lives alone. After editing, check whether this change ripples into **other** specs:

- Grep `specs/` for references to the feature, the events/hooks/config/components you touched, and shared foundations (`cron-infrastructure`, the workflow engine + lifecycle hooks, `message-event-publication`'s event contract, shared config namespaces, audit event types).
- For each spec that **depends on** or **describes** what you changed, judge whether it's now inaccurate or incomplete.

Present the impacted specs with *why*, then **ask the user** whether to update each. Update the ones they approve (recursively applying this skill's rules); never silently edit another feature's spec, and never leave a knowingly-stale one unflagged.

## Step 4 — Keep code and spec consistent

Per [AGENTS.md](../../../AGENTS.md): *"When implementing or changing a feature, keep its spec docs in sync with the code you land."* So:

- If the spec now describes behaviour the code doesn't yet have → the update implies implementation work. Offer to hand off to `/execute-spec` (which will re-run its own gap analysis).
- If you updated the spec to match **already-shipped** code (sync-with-code) → confirm the doc matches reality; no code change needed.

State clearly which case this is so the user knows whether a build is pending.

## Step 5 — Report

Summarize: which `Rn` were added/changed/deprecated, what design sections moved, which other specs were flagged/updated, and whether implementation is now pending or the spec merely caught up to code. Suggest `/group-commits` (docs scope, e.g. `docs(specs): …`) if the user wants to commit.

## Notes

- **Never** append delta/changelog sections — edit in place; git is the changelog.
- **Requirement numbers are append-only** — deprecate, never renumber or reuse.
- Don't let `requirements.md`/`design.md` describe two different states of the world — after your edit they must read as one coherent "today".
