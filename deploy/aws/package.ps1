$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
$env:DOTNET_CLI_HOME = Join-Path (Get-Location) '.artifacts\dotnet-home'
$env:NUGET_PACKAGES = Join-Path (Get-Location) '.artifacts\nuget'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Invoke-Checked 'npm.cmd' @('ci')
Invoke-Checked 'npm.cmd' @('run', 'build')
$release = Join-Path (Get-Location) '.artifacts\web'
New-Item -ItemType Directory -Force -Path $release | Out-Null
Invoke-Checked 'dotnet' @('publish', 'CaseTracker.csproj', '-c', 'Release', '-r', 'linux-x64', '--self-contained', 'true', '-o', $release)
Invoke-Checked 'tar' @('-czf', '.artifacts/web.tar.gz', '-C', $release, '.')
Copy-Item api\server.mjs .artifacts\server.mjs
Copy-Item deploy\aws\install-web.sh .artifacts\install-web.sh
Copy-Item deploy\aws\install-api.sh .artifacts\install-api.sh
Copy-Item api\api.env.example .artifacts\api.env
Copy-Item api\migrations\001_user_workspaces.sql .artifacts\001_user_workspaces.sql
Invoke-Checked 'tar' @('-czf', '.artifacts/site-update.tar.gz', '-C', 'dist', '.')
Write-Host 'Copy web.tar.gz, server.mjs, install-web.sh and install-api.sh from .artifacts/ to EC2 using SCP. S3 is optional.'
