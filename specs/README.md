# Specs

Living, feature-oriented specifications for spec-driven development.

## Feature index

### Business workflows

- [Virtual agent quote conversation](virtual-agent-quote/requirements.md)

## Layout

```
specs/
  README.md                     ← this file (conventions)
  <feature-name>/               ← one folder per FEATURE (not per ticket)
    requirements.md             ← WHAT: current desired behaviour + acceptance criteria
    design.md                   ← HOW: current implementation, component map, decisions
    tasks.md                    ← active iteration's task checklist only
```

## Conventions

- **Feature-named folders**, kebab-case — not ticket-named. A ticket is an
  _iteration_ of a feature; iteration history lives in git, not a hand-maintained
  changelog.
- `requirements.md` / `design.md` always describe the feature **as it should
  behave today**. When a requirement changes, **edit them in place** — do not
  append "new section" deltas.
- **Status header.** `requirements.md` and `design.md` open with a one-line header:
  ```
  > **Status:** Active · **Last updated:** YYYY-MM-DD · **Owner:** <name>
  ```
  `Status` ∈ `Draft` | `Active` | `Deprecated`.
- **Requirements are numbered `R1`, `R2`, …** and referenced from `design.md` and
  acceptance criteria. **Numbering is append-only: never renumber or reuse a
  number.** Retire a requirement by marking it `Deprecated` in place.
- `tasks.md` tracks only the _in-flight_ iteration. On ship, clear it for the next.
- Link to code with repo-relative paths from the feature folder.
