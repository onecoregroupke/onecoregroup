# Codex Notes

Use this skill for implementation and repair of WM video workflows. Prefer small, testable modules. Keep CLI behavior stable. When adding a command, update `README.md`, `SKILL.md`, and `src/cli.mjs`.

Before claiming success, run:

```bash
node src/cli.mjs doctor
node src/cli.mjs status --task TASK-XXXX
node src/cli.mjs validate --task TASK-XXXX
```

Use `--dry-run` for compile and delivery when verifying without producing or copying large files.
