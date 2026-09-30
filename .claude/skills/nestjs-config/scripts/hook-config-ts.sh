#!/usr/bin/env bash
# PermissionDenied hook: when a *.config.ts Read/Write/Edit is denied,
# inject context telling Claude to use the nestjs-config skill instead.
f=$(jq -r '.tool_input.file_path // ""')
case "$f" in
  *.config.ts)
    printf '{"hookSpecificOutput":{"hookEventName":"PermissionDenied","additionalContext":"Access to %s was denied because *.config.ts files cannot be Read/Write/Edited directly. Use the nestjs-config skill instead:\n  Read:  node .claude/skills/nestjs-config/scripts/read-config.mjs %s\n  Write: author the full file at /tmp/<name>.config.ts, then node .claude/skills/nestjs-config/scripts/write-config.mjs /tmp/<name>.config.ts %s"}}\n' "$f" "$f" "$f"
    exit 0
    ;;
esac
