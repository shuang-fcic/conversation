---
name: group-commits
description: Analyse all pending changes and split them into one or more meaningful conventional commits, grouped by intent — including splitting a single file across commits when its hunks belong to different logical changes. Checks that you're on a feature branch (main-{issueNumber}-...) — if you're on main, creates one. Use when asked to "commit", "group commits", "split into commits", "create meaningful commits", or "conventional commit" the current work.
---

# Group Commits Skill

Turn the current pending changes into a clean, meaningful commit history: analyse the diff, group changes by **intent** (not by directory), and create one conventional commit per group. A group can be a set of whole files, or — when a single file mixes unrelated changes — a subset of that file's hunks.

## Step 0 — Reset the index to a known state (critical)

**Do this first, before any grouping.** The index may already contain staged changes (fully or partially). If you `git add` a group and then `git commit` without controlling the index, `git commit` commits the **entire index** — so any pre-staged files get swept into the wrong commit with a message that doesn't describe them. This is the #1 failure mode.

Unstage everything (keeps all changes in the working tree, deletes nothing):

```bash
git reset            # mixed reset: index → clean, working tree untouched
git status --short   # confirm: every line should now show a working-tree change, nothing staged
```

From here on, **you** decide exactly what enters each commit by staging it explicitly right before committing.

## Step 1 — Branch guard

Run `git branch --show-current`.

**Feature branch pattern:** `main-{issueNumber}-{description}` (e.g. `main-212-cli-mail-templates`).

- If already on a matching feature branch → continue.
- If on `main` (or any other non-feature branch):
  1. Try `git pull origin main` (skip if it fails — offline is fine).
  2. Ask the user for the new branch name (issue number + short description), then `git checkout -b main-{issueNumber}-{description}`.

## Step 2 — Survey the changes (cheaply)

Start with the cheap, high-level views — don't read full file contents yet:

```bash
git status --short          # every pending file
git diff --stat             # size/shape of each change (all in the working tree now)
```

Read full diffs **only** for files you can't classify from their path/stat alone:

```bash
git diff -- path/to/file    # full hunks for one file when you need to judge grouping
```

**Token discipline:** prefer path- and stat-level reasoning. Only pull a full diff when the grouping decision genuinely depends on the file's contents (e.g. deciding whether one file needs to be split — see Step 4).

## Step 3 — Group by intent

Analyse what changed and cluster files by **logical area / intent** — the story each change tells, not the folder it lives in. Grouping signals:

- Same feature/module (e.g. all `email/template/` production code together)
- A new util/helper + its tests + the callers that adopt it
- Cross-cutting infra (e.g. `Dockerfile`, shell scripts, CI) separate from business logic
- Docs / spec updates separate from code

Aim for the **smallest set of groups that each tell a coherent story**. Don't micro-commit one file at a time; don't lump everything into one commit "because it's all one feature". If a change spans code + its spec doc, decide honestly: bundle them if the doc only documents that code; split if the spec is a standalone artifact.

**Sanity check before committing:** does each planned commit message truthfully describe *everything* in that commit, and nothing more? If a group contains files the message wouldn't mention, the grouping is wrong — re-split.

## Step 4 — When a single file spans two commits

If one file's hunks genuinely belong to different logical changes (e.g. a bug fix and an unrelated refactor in the same file), split it at the **hunk level** so the history stays honest. Weigh this against cost:

- **Cheap, preferred:** if the file's changes are actually cohesive, keep the whole file in one commit. Most files don't need splitting — don't split for its own sake.
- **When a split is warranted**, use a non-interactive patch (the harness bans interactive `git add -p` / `git add -i`):

  ```bash
  # 1. Write the hunks for THIS commit to a patch file (drop the hunks that belong elsewhere).
  git diff -- path/to/file > /tmp/all.patch        # inspect the hunk headers
  #    …craft /tmp/group-a.patch containing only this commit's hunks
  #    (copy the diff header + the wanted @@ hunks; keep line counts intact)

  # 2. Stage just those hunks, then commit.
  git apply --cached /tmp/group-a.patch
  git commit -m "..."

  # 3. The remaining hunks stay in the working tree for their own later commit.
  ```

  Verify the split applied cleanly with `git diff --cached --stat` before committing.

- **Cheaper alternative when hunks are non-overlapping and far apart:** you can often avoid hand-crafting patches — stage the whole file for whichever commit owns *most* of it, and mention the minor tag-along in the body. Only reach for `git apply --cached` when mixing the hunks would make a commit message dishonest. Use judgement: the goal is honest history at reasonable token cost, not surgical purity.

## Step 5 — Conventional commit format

```
type(scope): short description
```

**Types:** `feat` · `fix` · `refactor` · `test` · `docs` · `chore` · `style` · `perf` · `ci` · `build`

**Scope:** the module/area (`email-template`, `ack-template`, `scripts`, `db2`, `cron`, `ci`), kebab-case. Omit only for truly cross-cutting changes.

**Description:** imperative, lowercase, no trailing period, subject line ≤ 72 chars. Use a body (blank line, then bullets/prose) when the *why* isn't obvious from the subject.

Examples:
```
feat(email-template): add admin service for template CRUD
test(ack-template): add inspector unit tests
chore(scripts): add group-commits local skill
docs(specs): add template-management spec
```

## Step 6 — Stage and commit each group

For every group, in an order that keeps each commit self-consistent:

1. Stage **only** that group's paths (index was cleaned in Step 0):
   ```bash
   git add path/to/file1 path/to/file2 ...
   ```
   (or `git apply --cached` for a hunk subset — Step 4).
2. **Confirm the index holds exactly this group** before committing:
   ```bash
   git diff --cached --stat
   ```
3. Commit via HEREDOC (append the trailer):
   ```bash
   git commit -m "$(cat <<'EOF'
   feat(email-template): add admin service for template CRUD

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

## Step 7 — Report

Show the resulting history and confirm the tree is clean:

```bash
git log --oneline -{N}
git status --short      # should be empty
```

Then summarise:

```
Created N commits on branch main-{issueNumber}-{description}:
  abc1234  feat(email-template): add admin service for template CRUD
  def5678  test(email-template): add admin service unit tests
  ...
```

## Notes

- **Never commit on `main` directly.** The Step 1 branch guard must pass first.
- **Never use `--no-verify`.** If a hook fails, fix the underlying issue.
- **Never `git add .` / `git add -A` blindly** — stage explicit paths so unrelated or untracked junk doesn't ride along.
- **Verify before every commit** with `git diff --cached --stat`. This one habit is what prevents the "all changes in one commit" failure.
- If there are no pending changes, say so and stop.
