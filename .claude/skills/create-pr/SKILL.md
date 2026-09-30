---
name: create-pr
description: Create a pull request for the current feature branch. Derives the target branch and PR title automatically from the branch name. Feature branches named main-{issueNumber}-... target `main` and get a title prefixed `MAIN - `. Outputs a GitHub PR creation link AND runs `gh pr create`. Use when asked to "create a PR", "open a PR", or "make a pull request".
---

# Create PR Skill

## Step 1 — Gather context

```bash
git branch --show-current              # current (head) branch
git log --oneline main..HEAD           # commits going into the PR
git diff --stat main...HEAD            # files changed
```

Also read the branch name to determine the target.

## Step 2 — Determine target branch and title prefix

**Branch → target mapping:**

| Head branch pattern | Target branch | Title prefix |
|---|---|---|
| `main-{n}-...` | `main` | `MAIN` |

If the branch doesn't match a known pattern, ask the user which branch to target before continuing.

## Step 3 — Derive PR title

Format: `{TARGET_PREFIX} - {Action} {short description}`

- **`{TARGET_PREFIX}`** — uppercase target branch name (e.g. `MAIN`).
- **`{Action}`** — one of: `Add`, `Fix`, `Update`, `Refactor`, `Remove`, `Improve`. Pick the one that best matches the dominant change.
- **`{short description}`** — plain English, title-case, ≤ 60 chars, no trailing period.

Derive the description from the branch name + commit summaries. For example:
- Branch `main-212-cli-mail-templates` → `MAIN - Add CLI mail template commands`
- Branch `main-206-email-address-lookup-refactor` → `MAIN - Refactor email address lookup`

Ask the user to confirm or edit the title before creating the PR.

## Step 4 — Build the PR body

Write a short Markdown body:

```markdown
## Summary
- <bullet 1>
- <bullet 2>
- <bullet 3>

## Test plan
- [ ] Unit tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm run lint`)
- [ ] <feature-specific manual check>
```

Derive the summary bullets from the commit log and diff stat.

## Step 5 — Output the GitHub PR creation link

Construct and print the URL so the user can open it in a browser:

```
https://github.com/shuang-fcic/conversation/compare/{target}...{head}?quick_pull=1&title={encoded-title}&body={encoded-body}
```

URL-encode the title and body (spaces → `%20`, newlines → `%0A`, etc.). Print the full URL clearly so the user can click/copy it.

## Step 6 — Create via `gh pr create`

After printing the link, also run:

```bash
gh pr create \
  --base {target} \
  --title "{TITLE}" \
  --body "$(cat <<'EOF'
{body}
EOF
)"
```

If `gh` is not authenticated or the command fails, report the error and tell the user to use the link from Step 5 instead.

## Step 7 — Report

Print the PR URL returned by `gh pr create` (or the link from Step 5 if gh failed).

## Notes

- **Never create a PR from `main` to `main`.** If head branch is `main`, stop and tell the user to switch to a feature branch first (`/conventional-commits` can help create one).
- If there are uncommitted changes, warn the user and suggest running `/conventional-commits` first.
- The PR description is a starting point — remind the user to add context-specific notes after opening.
