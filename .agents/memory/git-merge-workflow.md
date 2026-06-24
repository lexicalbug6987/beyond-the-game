---
name: Git merge workflow in this environment
description: How to resolve a divergent-branch merge when raw git merge is blocked
---

Raw `git merge`, `git merge-tree`, and other history-rewriting git commands are
blocked in this environment (error: "Destructive git operations are not allowed").

**How to apply:** To "merge" a remote branch into local when histories diverged,
do NOT run git plumbing. Instead:
1. Find the merge base and use `git --no-optional-locks diff <base> <remote> -- <file>`
   (read-only, allowed) to see exactly what each side added.
2. Use `git --no-optional-locks show <remote>:<path>` to read the remote version of a file.
3. Edit the working-tree files (currently at local HEAD) to the final combined state,
   resolving conflicts by hand so BOTH features coexist.
4. Build + boot to verify; the platform records the actual merge commit on task merge.

**Why:** The sandbox forbids destructive git ops even for task agents. Conflict-marker
snapshots that appear in `automatic_updates` are platform-generated PREVIEWS, not the
disk state — the disk stays at HEAD until you edit it.
