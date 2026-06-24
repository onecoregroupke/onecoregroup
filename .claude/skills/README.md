# One Core Group Repo Skills

These repo-local skills are the portable operating layer for One Core Group work. Claude Code, Codex, Hermes, or any other agent working from this repository should read these folders first and use the CLIs here instead of relying on account-local skill installs.

## Skills

- `oc-ops`: task, project, client, artifact, context, and status operations for the Ops Hub.
- `oc-design`: design production and local delivery for OCG `TASK-XXXX` work.
- `oc-video`: code-native video production and local delivery for OCG `TASK-XXXX` work.

## Device Setup

On every device:

1. Clone or sync this repository.
2. Install dependencies from the repo root: `npm install`.
3. Configure Ops Hub access in `.env.local`:
   ```env
   OPS_OPS_BASE_URL=https://ops.onecoregroup.com
   OPS_AGENT_API_KEY=<agent key from Ops Hub env>
   ```
4. Configure local delivery in `.env.local` or the skill `.env`:
   ```env
   OCG_LOCAL_DELIVERY_ROOT=<path to the locally synced One Core Group Drive folder>
   ```
5. Run diagnostics:
   ```bash
   node scripts/oc-ops.mjs help
   node .claude/skills/oc-design/scripts/oc-design.mjs doctor
   node .claude/skills/oc-video/src/cli.mjs doctor
   ```

## Delivery Contract

Every completed draft must leave a location trail in two places:

- The chat response must mention the deliverable location, using the actual Drive/local path or link produced.
- Task Ops must receive the same location through an artifact or an attached task context note.

Preferred delivery target:

```text
OCG_LOCAL_DELIVERY_ROOT/
  <Brand or client area>/
    <PROJ-XXX project folder>/
      03_Working-Files/
        TASK-XXXX-...
```

If Google Drive Desktop is not connected on a new device, the agent should guide the user to install/sign in to Drive Desktop and set `OCG_LOCAL_DELIVERY_ROOT`. If work must continue offline, deliver into the skill's local `projects/TASK-XXXX/03_Working-Files` fallback, attach that path to Task Ops when credentials are available, and clearly label the chat response as a local fallback.

Generated task workspaces under `.claude/skills/*/projects/` are intentionally gitignored. The repo stores the skills and reusable references; Drive or the local fallback stores task deliverables.
