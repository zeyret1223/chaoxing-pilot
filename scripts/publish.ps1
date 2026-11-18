# One-shot publish to GitHub (requires GitHub CLI, `gh auth login` first)
param(
  [string]$Repo = "chaoxing-pilot",
  [string]$Visibility = "public",
  [string]$Description = "Quiz auto-answer assistant for Chaoxing/Xuexitong exam pages (MV3 extension)",
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".git")) {
  git init | Out-Null
  git branch -M main
  Write-Host "git initialized (branch main)"
}

git add -A

if ($SkipPush) {
  Write-Host "staged everything, stopped before commit (-SkipPush)"
  exit 0
}

$version = (Get-Content manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
$msg = "feat: Chaoxing Pilot v$version"
git commit -m $msg
Write-Host "committed: $msg"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI (gh) not found. Install it, run 'gh auth login', then:" -ForegroundColor Yellow
  Write-Host "  gh repo create $Repo --$Visibility --source . --push --description `"$Description`""
  exit 0
}

gh repo create $Repo --$Visibility --source . --push --description $Description
$user = gh api user --jq .login
Write-Host "done: https://github.com/$user/$Repo" -ForegroundColor Green
