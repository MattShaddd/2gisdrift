param([ValidatePattern('^v\d+\.\d+\.\d+$')][string]$Tag)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { param([string[]]$GitArgs) & git @GitArgs; if ($LASTEXITCODE -ne 0) { throw "Git failed: $($GitArgs[0])" } }
if (git status --porcelain) { throw 'Working tree has local changes. Commit or save them before updating.' }
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^(https://github\.com/|git@github\.com:)[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') { throw 'origin must be your trusted GitHub repository.' }
if (!$Tag) { throw 'Pass an explicit reviewed release tag, for example -Tag v0.1.1. Branch updates are intentionally not automatic.' }
Invoke-Git -GitArgs @('fetch', 'origin', "refs/tags/${Tag}:refs/tags/${Tag}")
Invoke-Git -GitArgs @('merge', '--ff-only', $Tag)
& node scripts/build.cjs
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
& node scripts/check.cjs
if ($LASTEXITCODE -ne 0) { throw 'Validation failed' }
Write-Host 'Updated local extension. Click Reload in chrome://extensions or edge://extensions, then reload the 2GIS tab.'
