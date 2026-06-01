# Sets up the wm-video Python toolchain (.venv) for align-voice + edit + reference.
#
# Lean by design: faster-whisper (CTranslate2 — no PyTorch, no pyannote) for
# word-level transcription, PySceneDetect for shots, yt-dlp for reference
# ingest. Installs in a few hundred MB so it fits on the skill's drive.
#
# Python 3.11/3.12 is pinned (broad CTranslate2/OpenCV wheels); the system 3.14
# is avoided. Usage:  pwsh -File scripts/setup-video-env.ps1

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $SkillRoot ".venv"

function Find-Python {
  foreach ($v in @("3.12", "3.11")) {
    try { & py "-$v" --version *> $null; if ($LASTEXITCODE -eq 0) { return @("py", "-$v") } } catch {}
  }
  Write-Error "Python 3.11 or 3.12 not found. Install one (winget install Python.Python.3.12) and re-run."
}

$pyLauncher = Find-Python
Write-Host "Using Python launcher: $($pyLauncher -join ' ')"

if (-not (Test-Path $Venv)) {
  & $pyLauncher[0] $pyLauncher[1] -m venv $Venv
  Write-Host "Created venv at $Venv"
}

$VenvPy = Join-Path $Venv "Scripts\python.exe"
& $VenvPy -m pip install --upgrade pip wheel

# Keep the model cache on C: (the skill drive is small). faster-whisper/HF read
# HF_HOME; the Node CLI sets the same when invoking.
$HfHome = Join-Path $env:LOCALAPPDATA "wm-video-models"
[Environment]::SetEnvironmentVariable("WM_VIDEO_HF_HOME", $HfHome, "User")
New-Item -ItemType Directory -Force -Path $HfHome | Out-Null

# Lean toolchain — no torch, no whisperx. --no-cache-dir avoids doubling disk.
& $VenvPy -m pip install --no-cache-dir faster-whisper "scenedetect[opencv]" yt-dlp pillow
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed (exit $LASTEXITCODE). Check free space on the skill drive." }

Write-Host ""
Write-Host "Done. Model cache: $HfHome"
Write-Host "Verify (run FROM the skill folder):"
Write-Host "  cd `"$SkillRoot`"; node src/cli.mjs doctor"
Write-Host "First align-voice/transcribe-source run downloads the Whisper model (~0.5GB) into the cache above (one-time)."
