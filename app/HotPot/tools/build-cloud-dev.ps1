[CmdletBinding()]
param(
    [string]$CreatorPath = 'C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe',
    [string]$WeChatCliPath = '',
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$developmentBranch = (& git -C $repositoryRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $developmentBranch -ne 'codex/cloudbase-player-save') {
    throw 'Cloud development builds require branch codex/cloudbase-player-save.'
}
$creatorRoot = Split-Path -Parent $CreatorPath
$env:COCOS_CREATOR_388 = $creatorRoot
& node (Join-Path $PSScriptRoot 'prepare-cloud.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Cloud preparation failed.' }
& (Join-Path $PSScriptRoot 'build-wechat.ps1') -CreatorPath $CreatorPath -WeChatCliPath $WeChatCliPath `
    -OutputName 'wechatgame-cloud-dev' -BuildConfigPath (Join-Path $PSScriptRoot 'wechat-cloud-dev.build.json') -SkipBuild:$SkipBuild
$buildRoot = Join-Path $projectRoot 'build\wechatgame-cloud-dev'
# GUI hooks and CLI builds share the same finalizer; repeated processing is idempotent.
& node (Join-Path $PSScriptRoot 'cloud-build-pipeline.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Cloud Dev artifact validation failed.' }
$totalBytes = (Get-ChildItem -LiteralPath $buildRoot -Recurse -File | Measure-Object Length -Sum).Sum
if ($totalBytes -ge 4000000) { throw "Development export exceeds 4 MB: $totalBytes bytes." }
Write-Host "Development build ready: $buildRoot ($totalBytes bytes)"
Write-Host 'Import this directory in WeChat DevTools; deploy hotpotPlayerDev only to the separate development environment.'
