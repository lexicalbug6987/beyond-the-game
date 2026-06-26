---
name: deployment storage persistence
description: Why admin edits did/didn't survive redeploys on the vm deployment, and how to verify
---

# Admin-content persistence across redeploys

The app stores admin-editable content (quiz, ui-content, sessions) via a pluggable
BlobStore that picks PostgreSQL when a DATABASE_URL-style env var is present, else
falls back to local file storage.

**Why edits were lost:** on the vm deployment, file storage lives under `/tmp`, which
is wiped on every redeploy. Persistence requires the deployment to actually have
DATABASE_URL available so it selects the Postgres backend.

**How to apply / verify:**
- `GET /api/health` exposes `storage` ("file"|"postgres") and `persistent`. On prod it
  must read `"storage":"postgres","persistent":true` for edits to survive redeploys.
- Admin writes require a session token: POST `/api/admin/auth` {password} -> {token},
  then send `Authorization: Bearer <token>` (the raw password is NOT accepted as the
  bearer token — that returns 401).
- Postgres is an external store; redeploying the vm app does not touch it, so once
  storage is postgres, data persists across redeploys.
