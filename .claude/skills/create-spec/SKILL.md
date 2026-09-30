---
name: create-spec
description: Scaffold a new feature spec under specs/<feature-name>/ (requirements.md + design.md + tasks.md) following the project's spec-driven-development conventions. Use when asked to "create a spec", "write a spec", "start a new feature spec", or "spec out <feature>". Produces feature-oriented, numbered-requirement docs — not ticket-oriented ones.
---

# Create Spec Skill

Scaffold a new **feature** spec that conforms to [specs/README.md](../../../specs/README.md). A spec is three files in one kebab-case, feature-named folder: `requirements.md` (WHAT + numbered `R1…`), `design.md` (HOW), `tasks.md` (in-flight iteration only). Read [specs/README.md](../../../specs/README.md) once at the start — it is the source of truth for conventions; this skill operationalizes it.

## Step 0 — Guardrails

- **Feature, not ticket.** The folder is named after the *feature* (e.g. `email-delivery-policy`), never after a ticket/issue. A ticket is one *iteration* of a feature.
- **Don't duplicate an existing feature.** List `specs/` first. If the request overlaps an existing feature, this is probably an `update-spec` job, not a new spec — surface that to the user and stop unless they confirm a genuinely new feature.
- Match the tone and structure of existing specs (skim 1–2 neighbours, e.g. [specs/document-cleanup/](../../../specs/document-cleanup/) for a compact one, [specs/cron-infrastructure/](../../../specs/cron-infrastructure/) for a larger one).

## Step 1 — Gather intent

Establish, from the user (ask concise clarifying questions only where genuinely ambiguous):

- **Feature name** → kebab-case folder name. Propose one; confirm before creating.
- **The problem / desired behaviour** (the WHAT).
- **Scope boundaries** — what's explicitly out of scope, and which *other* specs it touches (dependencies like `cron-infrastructure`).
- **Owner** (default: the git user / `git config user.name`) and today's date for the status header.

If the user gave enough detail already, don't interrogate — draft and let them correct.

## Step 2 — Explore the codebase

Before writing HOW, ground the design in reality. Search the relevant modules (`backend/src/...`) so `design.md` references **real** files, services, and patterns (workflow registry, `MessageService`, config namespaces, cron `CronCommand`, etc. per [AGENTS.md](../../../AGENTS.md)). A design that invents non-existent components is the main failure mode — cite concrete paths.

## Step 3 — Write `requirements.md`

Structure (mirror existing specs exactly):

```markdown
# Requirements — <Feature Title>

> **Status:** Draft · **Last updated:** YYYY-MM-DD · **Owner:** <name>

## Introduction

<2–4 paragraphs: the problem, the current state, what this feature establishes,
and how it fits the "write code as if distributed" philosophy where relevant.>

## Requirements

### R1 — <short title>

**User story:** As a <role>, I want <capability>, so that <benefit>.

#### Acceptance criteria

1. WHEN <condition> THEN the system SHALL <behaviour>.
2. THE system SHALL <invariant>.
...

### R2 — <short title>
...
```

Rules:
- **Requirements are numbered `R1`, `R2`, … append-only.** Never renumber later; retire with `Deprecated`, never delete-and-shift.
- Acceptance criteria use **EARS-style** keywords (`WHEN … THEN … SHALL`, `THE … SHALL`, `IF … THEN … SHALL`) — testable, unambiguous, one behaviour each.
- Start `Status: Draft`. It moves to `Active` once implemented.

## Step 4 — Write `design.md`

```markdown
# Design — <Feature Title>

> **Status:** Draft · **Last updated:** YYYY-MM-DD · **Owner:** <name>

## Overview

<1–2 paragraphs: the chosen approach and why, in prose.>

## Architecture

<An ASCII flow/diagram when it clarifies control flow, like neighbouring specs.>

## Components

### 1. <component> — [file.ts](../../backend/src/.../file.ts)
<What changes/gets added, with repo-relative links from the feature folder.>

...

## Decisions

<Notable trade-offs, alternatives rejected, and known deliberate exceptions.>
```

Rules:
- **Reference `Rn` from `design.md`** so traceability survives edits.
- **Link to code with repo-relative paths from the feature folder** (`../../backend/src/...`).
- Honour [AGENTS.md](../../../AGENTS.md) conventions (options-object params, config namespaces, audit trail, no Redis, distributed-safe operations). Flag anything that would break under multiple instances.

## Step 5 — Write `tasks.md`

Only the **in-flight iteration's** checklist — not a full history.

```markdown
# Tasks — <Feature Title>

> In-flight iteration: <one-line description of this iteration's goal>.

- [ ] 1. **<Group>** (Req <n>, <m>)
  - [ ] 1.1 <concrete, code-level step referencing real files>
  - [ ] 1.2 <unit test / verification step>
- [ ] 2. **Verification**
  - [ ] 2.1 `pnpm run build`, `pnpm run lint`, `pnpm test`.
```

Each task references the `Rn` it satisfies and points at concrete files/tests.

## Step 6 — Register in the index

Add the feature to the **Feature index** in [specs/README.md](../../../specs/README.md), under the right section (`Platform behavior` or `Business workflows`), alphabetically:

```markdown
- [<Feature Title>](<feature-name>/requirements.md)
```

## Step 7 — Report

List the created files and the chosen requirement numbers, then ask the user to review `requirements.md` first (WHAT before HOW). Remind them the spec is `Draft` until implemented, and that `/execute-spec` will drive the build.

## Notes

- **Never** append "delta"/changelog sections to `requirements.md`/`design.md` — they describe today's desired state. History lives in git.
- Keep `tasks.md` scoped to one iteration; clear it on ship.
- If the feature is a business workflow, ensure the design covers the `@Workflow` registration + lifecycle hooks per [AGENTS.md](../../../AGENTS.md).
