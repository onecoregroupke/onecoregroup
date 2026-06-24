# Open Design Provider

Open Design is installed locally at:

```text
C:\Cognexa Co\00_TOOLS\open-design
```

Useful defaults:

```text
OPEN_DESIGN_ROOT=C:\Cognexa Co\00_TOOLS\open-design
OD_DAEMON_URL=http://127.0.0.1:17456
```

This PC also has an existing repo runtime data folder:

```text
C:\Cognexa Co\00_TOOLS\open-design\.od
```

Open Design can run in foreground/background using its repo tooling:

```bash
pnpm tools-dev run web
pnpm tools-dev start web
pnpm tools-dev status
pnpm tools-dev logs
pnpm tools-dev stop
```

Working fixed-port startup on this PC:

```bash
corepack pnpm tools-dev start web --daemon-port 17456 --web-port 17573
```

If `pnpm` is not on PATH, use `corepack pnpm ...`, launch Open Design normally, or use its desktop app, then check the daemon URL from the Open Design UI/logs.

Primary daemon endpoints used or referenced by `wm-design`:

- `GET /api/health`
- `GET /api/projects`
- `POST /api/import/folder`
- `GET /api/projects/:id`
- `GET /api/projects/:id/files`
- `POST /api/projects/:id/files`
- `GET /api/projects/:id/archive`
- `POST /api/projects/:id/export/pdf`
- `POST /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events`

Automation stance:

- Prefer importing a prepared local project folder through `POST /api/import/folder`.
- Keep the provider prompt and export checklist in the project folder, so Open Design’s agent can read the same source files as Codex.
- Treat model execution as optional: if daemon/model/agent config is unavailable, stop at a complete handoff package instead of faking generation.
- Collect exports from the Open Design project folder, archive download, browser download folder, or a user-specified export folder.
