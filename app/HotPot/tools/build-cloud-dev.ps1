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
    -OutputName 'wechatgame-cloud-dev' -SkipBuild:$SkipBuild
$buildRoot = Join-Path $projectRoot 'build\wechatgame-cloud-dev'
$gameConfigPath = Join-Path $buildRoot 'game.json'
$gameConfig = Get-Content -LiteralPath $gameConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$gameConfig | Add-Member -NotePropertyName cloud -NotePropertyValue $true -Force
[System.IO.File]::WriteAllText($gameConfigPath, ($gameConfig | ConvertTo-Json -Depth 20 -Compress), (New-Object System.Text.UTF8Encoding($false)))
$projectConfigPath = Join-Path $buildRoot 'project.config.json'
$projectConfig = Get-Content -LiteralPath $projectConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$projectConfig | Add-Member -NotePropertyName cloudfunctionRoot -NotePropertyValue '../../cloudfunctions/' -Force
$projectConfig.projectname = 'HotPot-Cloud-Dev'
[System.IO.File]::WriteAllText($projectConfigPath, ($projectConfig | ConvertTo-Json -Depth 20 -Compress), (New-Object System.Text.UTF8Encoding($false)))
$totalBytes = (Get-ChildItem -LiteralPath $buildRoot -Recurse -File | Measure-Object Length -Sum).Sum
if ($totalBytes -ge 4000000) { throw "Development export exceeds 4 MB: $totalBytes bytes." }
Write-Host "Development build ready: $buildRoot ($totalBytes bytes)"
Write-Host 'Import this directory in WeChat DevTools; deploy hotpotPlayerDev only to the separate development environment.'
