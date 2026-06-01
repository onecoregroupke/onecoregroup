# Hermes Notes

Hermes should map Telegram requests to CLI commands:

- "make a motion video for TASK-XXXX" -> `init`, `plan`, `generate-scenes`, then ask before render/compile when assets are missing.
- "render TASK-XXXX" -> `render-scenes`.
- "compile TASK-XXXX" -> `compile --dry-run`, then compile after approval.
- "deliver TASK-XXXX" -> `deliver --dry-run`, then deliver after approval.

Hermes should always reply with draft status, file/folder path, missing assets, and next approval needed. Never publish or mark final.
