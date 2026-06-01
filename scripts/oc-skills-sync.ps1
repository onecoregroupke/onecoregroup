<#
  oc-skills-sync.ps1 — re-mirror the WM agent skills into the OCG skills and
  preserve the OCG overlays in one step.

  Pulls the latest wm-design / wm-video from a local wm-task-ops clone and
  code-mirrors them into .claude/skills/oc-design / oc-video, WITHOUT clobbering
  the OCG-specific overlays:
    - SKILL.md (both)                      — OCG-branded
    - oc-video/config/skill.config.json    — name + default brand
    - oc-video/config/taskops.config.json  — Ops Hub /api/agent endpoints
    - oc-video/registry/brand.registry.json — 6 OCG brands
    - oc-video/reference/brands/**          — 6 OCG brand profiles + _shared
    - oc-design CLI is kept as oc-design.mjs (upstream logic copied in)

  Generated/working data is preserved (projects, exports, frames, .venv,
  node_modules, user-supplied reference/audio).

  Usage (from repo root):
    pwsh -File scripts/oc-skills-sync.ps1
    pwsh -File scripts/oc-skills-sync.ps1 -WmRepo "C:\path\to\wm-task-ops" -Pull
#>
param(
  [string]$WmRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\WM-INTERNAL\wm-task-ops") -ErrorAction SilentlyContinue),
  [switch]$Pull
)

$ErrorActionPreference = 'Stop'
$ocRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$wmSkills = Join-Path $WmRepo ".claude\skills"
$ocSkills = Join-Path $ocRoot ".claude\skills"

if (-not (Test-Path $wmSkills)) {
  Write-Error "wm-task-ops skills not found at '$wmSkills'. Pass -WmRepo <path to wm-task-ops>."
}

if ($Pull) {
  Write-Host "Pulling latest in $WmRepo ..." -ForegroundColor Cyan
  git -C $WmRepo pull --ff-only
}

# Robocopy success = exit code < 8.
function Mirror($src, $dst, [string[]]$xf, [string[]]$xd) {
  $args = @($src, $dst, '/E', '/PURGE', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  # Always preserve generated/working + tooling dirs.
  $xd = @($xd) + @('projects','exports','frames','.venv','node_modules','audio')
  if ($xf) { $args += @('/XF') + $xf }
  if ($xd) { $args += @('/XD') + $xd }
  robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) for $src -> $dst" }
}

Write-Host "Syncing wm-video -> oc-video (preserving OCG overlays)..." -ForegroundColor Cyan
Mirror (Join-Path $wmSkills 'wm-video') (Join-Path $ocSkills 'oc-video') `
  @('SKILL.md','skill.config.json','taskops.config.json','brand.registry.json') `
  @('brands')   # reference/brands holds the 6 OCG profiles + _shared

Write-Host "Syncing wm-design -> oc-design (preserving OCG overlays)..." -ForegroundColor Cyan
Mirror (Join-Path $wmSkills 'wm-design') (Join-Path $ocSkills 'oc-design') `
  @('SKILL.md','wm-design.mjs') `
  @()
# Keep the OCG-named CLI current with upstream logic.
$wmDesignCli = Join-Path $wmSkills 'wm-design\scripts\wm-design.mjs'
if (Test-Path $wmDesignCli) {
  Copy-Item $wmDesignCli (Join-Path $ocSkills 'oc-design\scripts\oc-design.mjs') -Force
}

Write-Host ""
Write-Host "Done. OCG overlays preserved. Review changes with: git -C `"$ocRoot`" status .claude/skills" -ForegroundColor Green
Write-Host "If the video toolchain changed, re-run: node .claude/skills/oc-video/src/cli.mjs doctor" -ForegroundColor DarkGray
