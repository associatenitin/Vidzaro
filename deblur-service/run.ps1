# Run deblur service. Use project root .venv when in deblur-service.
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path "$root\.venv\Scripts\Activate.ps1") {
    & "$root\.venv\Scripts\Activate.ps1"
}
Set-Location $PSScriptRoot
python main.py
