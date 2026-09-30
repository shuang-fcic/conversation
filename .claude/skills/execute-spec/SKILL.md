---
name: execute-spec
description: Execute a feature spec under specs/<feature-name>/ — but first evaluate what's already built, find the gap between spec and code, confirm scope with the user before writing code, and check whether the change impacts other specs. Use when asked to "execute a spec", "implement a spec", "build the spec", "work the tasks", or "continue <feature>". Handles both greenfield and partially-built features.
---

# Execute Spec Skill

Drive a feature spec to implementation. The core idea: a feature may be **fully unbuilt, partially built, or drifted from its spec** — so this skill *evaluates the current state first*, finds the gap, gets the user's go-ahead, then implements, and finally checks impact on **other** specs. Never assume the tasks list is an accurate to-do — verify against the code.

## Step 1 — Load the spec

Determine which feature (from the user, or the currently open file under `specs/`). Read all three:

- `specs/<feature>/requirements.md` — the `R1…` acceptance criteria (the contract).
- `specs/<feature>/design.md` — the intended HOW + component map.
- `specs/<feature>/tasks.md` — the *claimed* in-flight checklist (treat as a hint, not truth).

Also skim [specs/README.md](../../../specs/README.md) and [AGENTS.md](../../../AGENTS.md) for conventions the implementation must honour.

## Step 2 — Evaluate what's already built (gap analysis)

**Do not trust checkboxes.** Go to the code and establish ground truth for each requirement:

- For every `Rn`, find the code that satisfies it (the files/services `design.md` names — verify they exist and do what the design claims). Use search across `backend/src/...`.
- Look for **drift**: code that contradicts the spec, half-done work, or design components that were never built (or built differently).
- Check for existing tests covering each `Rn`.

Produce a **gap table** — one row per requirement:

| Req | Design says | Code reality | Status |
|-----|-------------|--------------|--------|
| R1  | …           | …            | ✅ Done / 🟡 Partial / ❌ Missing / ⚠️ Drifted |

For a partially-built feature this is the most important step — it replaces the stale `tasks.md` with an accurate picture.

## Step 3 — Present the gap and confirm scope (checkpoint)

Show the user:

1. The **gap table** — what's done, partial, missing, or drifted.
2. Your **proposed execution plan** — the concrete tasks to close the gap, in order, each tied to an `Rn` and real files.
3. Any **open questions / decisions** the design leaves ambiguous.

Then **ask before writing code**, using `AskUserQuestion` where there are real choices:

- Do you want to execute this now, and **which parts** (all gaps / a subset / just the missing `Rn`)?
- For any **drift**, should the code change to match the spec, or the spec change to match the code (→ hand off to `/update-spec`)?
- Confirm any ambiguous design decision.

If the feature is already fully built and matches the spec, say so and stop — there's nothing to execute (offer a verification run instead).

## Step 4 — Refresh `tasks.md`

Once scope is agreed, rewrite `specs/<feature>/tasks.md` so it reflects the **actual** in-flight iteration (the agreed gap-closing work), per the [specs/README.md](../../../specs/README.md) format — checkboxes tied to `Rn`, concrete files, a final Verification group. This becomes the live progress tracker. Use `TodoWrite` in parallel to track the session.

## Step 5 — Implement

Work the tasks in dependency order. For each:

- Follow every convention in [AGENTS.md](../../../AGENTS.md): options-object params, config namespaces (use the `/nestjs-config` skill to touch `*.config.ts`), typed `DomainError`s, structured pino logging (objects-first, static message, correlation key), the audit trail, DB2 timezone rules, distributed-safe/idempotent operations, import-path rules.
- Add/extend tests alongside the code (unit colocated `*.spec.ts`; e2e/integration per [TESTING.md](../../../backend/TESTING.md)). Cover each `Rn` you implement.
- Tick the `tasks.md` checkbox and the todo as each lands.

## Step 6 — Cross-spec impact analysis (required)

Before finishing, examine whether this change **impacts other specs**. This is a first-class step, not an afterthought:

- Grep `specs/` for references to the modules/files/events/config you changed (e.g. a new event name, a changed hook signature, a shared component like `cron-infrastructure`, a config namespace).
- Identify features that **depend on** this one or that **describe** the code you touched. Common coupling points: the workflow engine + lifecycle hooks, `cron-infrastructure`'s generic engine, `message-event-publication`'s event contract, shared config namespaces, the audit event types.
- For each potentially-affected spec, judge whether its `requirements.md`/`design.md` is now **inaccurate** (describes behaviour you changed) or **incomplete** (a new interaction it should mention).

Present the list of impacted specs with *why* each is impacted, then **ask the user** (via `AskUserQuestion`) whether to update them — and if yes, hand each off to `/update-spec` (or update inline if trivial). Never silently edit another feature's spec; and never leave a knowingly-stale spec without flagging it.

## Step 7 — Update this feature's own spec

If implementation revealed the design/requirements were wrong or evolved (drift you resolved in code's favour, or new decisions), update *this* feature's `requirements.md`/`design.md` **in place** (edit, never append deltas), bump `Last updated`, and flip `Status: Draft → Active` once the feature behaves as specified. Requirement numbers stay append-only.

## Step 8 — Verify & report

- Run `pnpm run build`, `pnpm run lint`, `pnpm test` (from `backend/`). Report real results — if something fails, say so with the output; don't claim green on red.
- Summarize: which `Rn` are now satisfied, what tests were added, which other specs were flagged/updated, and any remaining gap deliberately left for a later iteration (with a `log`-style note so it isn't silently dropped).
- Do **not** commit unless asked — suggest `/group-commits` for a clean history.

## Notes

- The three checkpoints that make this skill safe: **Step 3** (confirm scope before coding), **Step 6** (confirm cross-spec updates), **Step 7** (keep this spec honest). Don't skip them to save a round-trip.
- If Step 2 reveals the "spec" is really a fresh feature with no folder yet, redirect to `/create-spec`.
- Treat retry/idempotency and concurrent paths as first-class per [AGENTS.md](../../../AGENTS.md) — the distributed-system stance applies to everything you build here.
