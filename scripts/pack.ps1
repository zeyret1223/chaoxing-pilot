# Pack the extension into a distributable zip (load-unpacked ready for Chrome / Edge)
param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content "manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
$name = "chaoxing-pilot-v$version"
$out = Join-Path $root $OutDir
New-Item -ItemType Directory $out -Force | Out-Null

$tmp = Join-Path $env:TEMP "$name-$(Get-Random)"
New-Item -ItemType Directory $tmp -Force | Out-Null

$include = @("manifest.json", "LICENSE", "README.md", "icons", "src", "data")
foreach ($item in $include) {
  if (Test-Path $item) { Copy-Item $item -Destination $tmp -Recurse -Force }
}

$zip = Join-Path $out "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $tmp -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "packed: $zip ($size KB)"
