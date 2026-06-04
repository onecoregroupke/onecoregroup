---
name: oc-design
description: One Core Group design-production routing for the Ops Hub. Use when Codex, Hermes, or Claude Code needs to create brand guidelines, brand/design systems, pitch/brand decks, posters, social-media design kits, SVG/transparent graphics, overlays, or local design deliverables for an OCG TASK-XXXX (across the 6 brands). Defaults to Open Design as provider and delivers draft files through oc-ops / Ops Hub. Draft-only: never publish or send externally.
---

# OC Design

Design-production routing for One Core Group. Tasks start from Ops Hub context (via **oc-ops**), route through a design provider, and return draft artifacts to the brand/project delivery folder. Adapted from the WM & Co `wm-design` skill; configured for OCG's 6 brands.

**Model note:** this skill is executed by the orchestrating agent (Codex / Hermes / Claude Code) using the best available model — NOT Groq. Groq is reserved for the Ops Hub's automated report narration.

## Brands

`nairobi-piano-technicians` · `glitz-n-glim` · `nuuranest-stays` · `ar-rayyan-playhouse` · `rhythms-college` · `darul-swafa`

## Operating Rule

Use the CLI as the source of truth:

```bash
node .claude/skills/oc-design/scripts/oc-design.mjs <command> [options]
```

Default provider is `open_design`. Use **oc-ops** for task lookup/status/context and Ops Hub delivery for files.

## Core Workflow

```bash
node .claude/skills/oc-design/scripts/oc-design.mjs doctor
node .claude/skills/oc-design/scripts/oc-design.mjs init --task TASK-XXXX --type poster --brand glitz-n-glim
node .claude/skills/oc-design/scripts/oc-design.mjs route --task TASK-XXXX
node .claude/skills/oc-design/scripts/oc-design.mjs collect --task TASK-XXXX --source "<export-folder-or-file>"
node .claude/skills/oc-design/scripts/oc-design.mjs deliver --task TASK-XXXX
```

For a manual/browser-assisted provider run, use the generated handoff prompt at `projects/TASK-XXXX/handoff/PROMPT-FOR-OPEN-DESIGN.md`.

## Providers

- `open_design`: Default. Prepare a local project folder, import into the local Open Design daemon when available, write a complete provider prompt package.
- `claude_design`: Handoff-only until Claude Design exposes a product API. Prepare prompts/checklists, then collect manually downloaded files.
- `code_native`: Produce local HTML/CSS/SVG/PDF-style artifacts directly when Open Design isn't needed.

## Deliverable Types

`brand_guidelines` · `brand_system` · `poster` · `social_kit` · `svg_overlay` (handoff for oc-video) · `deck`.

## Delivery (OCG)

- Draft-only. Never publish, never send external client messages, never mark `Completed`. Successful delivery sets/recommends `AI Draft Ready`.
- Deliver exports into the brand/project folder, then register with Ops via **oc-ops**:
  ```bash
  node scripts/oc-ops.mjs submit-artifact --task TASK-XXXX --specialist design_deck \
    --title "<Brand> — <deliverable>" --content-file <handoff-or-summary.md> --summary "Design draft delivered: <link>"
  ```
  This flips the task to `AI Draft Ready`; the Ops Hub callback returns it to the Content Calendar (if sourced from a content row) and auto-schedules.

## Brand design systems (local Drive sync)

Three brands have full design systems extracted at:

| Brand | Slug | Local path |
|---|---|---|
| Nairobi Piano Technicians | `nairobi-piano-technicians` | `C:\Users\Administrator\Desktop\OCG DRIVE SYNC\CENTER POINT\NAIROBI PIANO TECHNICIANS DEPARTMENT\DESIGN SYSTEM\NPT Design System (1)\` |
| Nuuranest Stays | `nuuranest-stays` | `C:\Users\Administrator\Desktop\OCG DRIVE SYNC\CENTER POINT\NUURANEST STAYS DEPARTMENT\DESIGN SYSTEM\Nuuranest Design System (1)\` |
| Glitz N' Glim | `glitz-n-glim` | `C:\Users\Administrator\Desktop\OCG DRIVE SYNC\CENTER POINT\ICELAND GEYSER DEPARTMENT\DESIGN SYSTEM\Glitz N' Glim Design System (1)\` |

Each contains: `README.md` (brand strategy + visual tokens), `SKILL.md` (agent entry point), `colors_and_type.css` (all CSS tokens), `assets/` (logos), `preview/` (HTML component cards), `ui_kits/website/` (React kit).

**Always read the brand's `SKILL.md` and `colors_and_type.css` before generating any visual asset.** The project context for any brand project will have the path in its `## Code references` section (set automatically on project creation via `BRAND_DESIGN_SYSTEM_PATHS` env var).

## Production scripts (code-native delivery)

```bash
# 1. Generate a self-contained HTML carousel (embeds logo as base64)
node scripts/generate-carousel.mjs

# 2. Render PNGs via headless Chrome + upload to Drive
node scripts/export-carousel-pngs.mjs

# 3. Download / refresh design system zips from Drive
node scripts/download-design-systems.mjs
```

## Configure local delivery + provider (env)

```env
OPS_OPS_BASE_URL=https://ops-hub-blond.vercel.app
OPS_AGENT_API_KEY=<the Ops Hub agent key>
BRAND_DESIGN_SYSTEM_PATHS={"nairobi-piano-technicians":"<path>","nuuranest-stays":"<path>","glitz-n-glim":"<path>"}
OD_DAEMON_URL=http://127.0.0.1:17456
```

If `OD_DAEMON_URL` is not running, `route` still creates a complete handoff package and reports the daemon blocker. For Open Design API/config details, read `references/open-design-provider.md` only when routing or debugging.
