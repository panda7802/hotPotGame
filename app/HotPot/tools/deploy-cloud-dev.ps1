[CmdletBinding()]
param(
    [string]$CreatorRoot = 'C:\ProgramData\cocos\editors\Creator\3.8.8',
    [string]$WeChatCliPath = 'D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$developmentBranch = (& git -C $repositoryRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $developmentBranch -ne 'codex/cloudbase-player-save') {
    throw 'Cloud Dev deployment requires branch codex/cloudbase-player-save.'
}
if (-not (Test-Path -LiteralPath $WeChatCliPath -PathType Leaf)) { throw 'WeChat DevTools CLI not found.' }
$env:COCOS_CREATOR_388 = $CreatorRoot
& node (Join-Path $PSScriptRoot 'prepare-cloud.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Cloud preparation failed.' }
$functionRoot = Join-Path $projectRoot 'cloudfunctions\hotpotPlayerDev'
$settings = Get-Content -LiteralPath (Join-Path $functionRoot 'settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $settings.enabled -or $settings.collectionName -ne 'hotpot_players_dev') { throw 'Cloud Dev configuration is not enabled.' }
# 唯一上传目录被固定为本分支的 hotpotPlayerDev，不部署其他云函数或游戏版本。
$previousErrorAction = $ErrorActionPreference
try {
    # Windows PowerShell treats CLI progress on stderr as NativeCommandError.
    # Capture it, then check both the actual exit code and the completed output.
    $ErrorActionPreference = 'Continue'
    $deployOutput = & $WeChatCliPath cloud functions deploy --env $settings.environmentId `
        --paths $functionRoot --appid $settings.appId --remote-npm-install 2>&1
    $cliExitCode = $LASTEXITCODE
}
finally { $ErrorActionPreference = $previousErrorAction }
$deployText = $deployOutput -join [Environment]::NewLine
Write-Host $deployText
if ($cliExitCode -ne 0 -or $deployText -match '\[error\]|initialize error|deploy.*fail|未登录') {
    throw 'Cloud Dev deployment failed; check the DevTools login/connection before retrying.'
}
Write-Host 'hotpotPlayerDev deployment command completed. Verify it in CloudBase and test from the development game.'
