# Repo-Local Skills and Delivery Portability

The One Core Group repo can be the canonical source for operational skills across devices. This keeps Claude Code, Codex, Hermes, and other agent accounts aligned as long as they work from the synced repository.

## Per-Device Requirements

- Repository available locally.
- Node dependencies installed from the repo root.
- Ops Hub credentials in `.env.local`: `OPS_OPS_BASE_URL` and `OPS_AGENT_API_KEY`.
- Google Drive Desktop connected when possible.
- `OCG_LOCAL_DELIVERY_ROOT` pointing to the locally synced One Core Group delivery root.

## Fallback Behavior

When Google Drive Desktop or the expected project folder is unavailable, agents should not block draft production. They should:

1. Produce the draft in the skill-local project workspace.
2. Copy final outputs into `projects/TASK-XXXX/03_Working-Files`.
3. Write a delivery summary or manifest.
4. Attach that local path to the Task Ops task if API credentials are configured.
5. Tell the user exactly where the fallback deliverable is and what Drive setup is missing.

## Mandatory Completion Response

Every task completion response must include:

- Deliverable location: Drive URL, synced local folder, or local fallback folder.
- Task Ops update: artifact id/link or context note/status result.
- Draft status: normally `AI Draft Ready`, never `Completed` unless the user explicitly confirms completion.

This rule applies even when the deliverable is a document, design export, video, spreadsheet, or code artifact.
