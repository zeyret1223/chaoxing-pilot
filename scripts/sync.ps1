# Sync this repo to both GitHub and Gitee in one command.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/sync.ps1 -Message "your change"
param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dirty = git status --porcelain
if (-not $dirty) {
  Write-Host "nothing to commit" -ForegroundColor Yellow
} elseif (-not $Message) {
  Write-Host "there are changes but -Message is empty; aborting" -ForegroundColor Yellow
  exit 1
} else {
  git add -A
  git commit -m $Message
}

Write-Host "pushing to origin (GitHub + Gitee) ..." -ForegroundColor Cyan
git push

Write-Host ""
git remote -v
git log --oneline -1
Write-Host "done" -ForegroundColor Green
