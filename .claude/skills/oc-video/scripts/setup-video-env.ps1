# Sets up the wm-video Python toolchain (.venv) for align-voice + reference.
#
# WhisperX/PyTorch and PySceneDetect need a pinned Python (3.11 or 3.12) — the
# system Python (3.14) is too new for the ML wheels. This creates a local .venv
# under the skill folder so the Node CLI can find it automatically.
#
# Usage:  pwsh -File scripts/setup-video-env.ps1            (CPU install)
#         pwsh -File scripts/setup-video-env.ps1 -Gpu       (CUDA torch)

param([switch]$Gpu)

$ErrorActionPreference = "Stop"
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

if ($Gpu) {
  & $VenvPy -m pip install torch torchaudio
} else {
  & $VenvPy -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
}

# Core toolchain. whisperx pulls faster-whisper + alignment models on first run.
& $VenvPy -m pip install whisperx "scenedetect[opencv]" yt-dlp pillow

Write-Host ""
Write-Host "Done. Verify with:  node src/cli.mjs doctor"
Write-Host "First align-voice/reference run will download Whisper + alignment models (one-time)."
