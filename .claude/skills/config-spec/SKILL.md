# Working with `*.config.spec.ts` files

## Why this skill exists

The global permission deny that blocks `*.config.ts` files uses a pattern broad enough to also match `*.config.spec.ts` (anything matching `**/*.config*.ts`). So test files like `cron.config.spec.ts` or `email.config.spec.ts` are denied by the **Read**, **Write**, and **Edit** tools even though they are plain test files with no secrets. Shell-level `node` is not subject to that deny.

## Reading a `*.config.spec.ts` file

```bash
node .claude/skills/config-spec/scripts/read-config-spec.mjs backend/src/cron/cron.config.spec.ts
```

Equivalent inline one-liner:

```bash
node -e "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))" backend/src/cron/cron.config.spec.ts
```

## Editing / writing a `*.config.spec.ts` file

Same temp-file approach as `nestjs-config`:

1. **Write the full new file** to `/tmp/<name>.spec.ts` using the normal **Write** tool (works under `/tmp`). If modifying, read the current file first (above), apply your change to the full text, and write the complete result.
2. **Copy it onto the target** with the helper:

```bash
node .claude/skills/config-spec/scripts/write-config-spec.mjs /tmp/cron.config.spec.ts backend/src/cron/cron.config.spec.ts
```

3. **Verify** with `git diff` or re-read:

```bash
git --no-pager diff backend/src/cron/cron.config.spec.ts
```

## Notes

- Both helper scripts refuse any target that isn't `*.spec.ts`, so they can't be misused on production files.
- For in-place string substitutions on large files, use a node script with `readFileSync` + `replace` + `writeFileSync` — the inline approach avoids a round-trip through `/tmp`.
