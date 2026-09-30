[CmdletBinding()]
param(
    [string]$AppId = 'wx943cc2d81ec6f820',
    [string]$CreatorPath = 'C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe',
    [string]$WeChatCliPath = '',
    [switch]$Open,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $projectRoot 'build\wechatgame'
$projectConfigPath = Join-Path $buildRoot 'project.config.json'
$gameConfigPath = Join-Path $buildRoot 'game.json'
$startScene = '7c3e7fab-7b1e-4865-ba84-3cf81b48b9fb'
$testAppId = 'wx6ac3f5090a6b99c5'

function Assert-WeChatBuildOutput {
    if (-not (Test-Path -LiteralPath $projectConfigPath)) {
        throw "Build output is missing project.config.json: $projectConfigPath"
    }

    if (-not (Test-Path -LiteralPath $gameConfigPath)) {
        throw "Build output is missing game.json: $gameConfigPath"
    }
}

if (-not $SkipBuild) {
    if (-not (Test-Path -LiteralPath $CreatorPath -PathType Leaf)) {
        throw "Cocos Creator was not found: $CreatorPath"
    }

    $trimmedAppId = $AppId.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmedAppId) -or $trimmedAppId.Contains(';') -or $trimmedAppId.Contains('"')) {
        throw 'AppId cannot be empty or contain semicolons or double quotes.'
    }

    $runningCreator = Get-Process -Name 'CocosCreator' -ErrorAction SilentlyContinue
    if ($runningCreator) {
        throw 'Cocos Creator is running. Save the project and close the editor before using this script.'
    }

    $buildOptions = @(
        'platform=wechatgame'
        'buildPath=project://build'
        'outputName=wechatgame'
        'name=HotPot'
        'debug=false'
        'mainBundleCompressionType=subpackage'
        'sourceMaps=false'
        'md5Cache=false'
        "startScene=$startScene"
        'orientation=portrait'
        "appid=$trimmedAppId"
        'buildOpenDataContextTemplate=false'
        'separateEngine=false'
        'highPerformanceMode=false'
        'wasmSubpackage=false'
    ) -join ';'

    $buildStartedAt = Get-Date
    Write-Host "Building WeChat Mini Game: $projectRoot"
    Write-Host "AppId: $trimmedAppId"

    $arguments = @('--project', $projectRoot, '--build', $buildOptions)
    $creatorProcess = Start-Process -FilePath $CreatorPath -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $deadline = $buildStartedAt.AddMinutes(15)

    while ((Get-Date) -lt $deadline) {
        $creatorProcess.Refresh()
        if ($creatorProcess.HasExited -and $creatorProcess.ExitCode -ne 36) {
            throw "Cocos Creator build failed with exit code $($creatorProcess.ExitCode)."
        }
        $projectConfigReady = Test-Path -LiteralPath $projectConfigPath -PathType Leaf
        $gameConfigReady = Test-Path -LiteralPath $gameConfigPath -PathType Leaf

        if ($creatorProcess.HasExited -and $projectConfigReady -and $gameConfigReady) {
            $projectConfigTime = (Get-Item -LiteralPath $projectConfigPath).LastWriteTime
            $gameConfigTime = (Get-Item -LiteralPath $gameConfigPath).LastWriteTime
            if ($projectConfigTime -ge $buildStartedAt -and $gameConfigTime -ge $buildStartedAt) {
                break
            }
        }

        Start-Sleep -Seconds 2
    }

    Assert-WeChatBuildOutput

    # Creator 3.8 reports successful command-line builds with exit code 36.
    if (-not $creatorProcess.HasExited -or $creatorProcess.ExitCode -ne 36) {
        throw 'Cocos Creator did not finish successfully. Check the Creator build log.'
    }

    $projectConfigTime = (Get-Item -LiteralPath $projectConfigPath).LastWriteTime
    $gameConfigTime = (Get-Item -LiteralPath $gameConfigPath).LastWriteTime
    if ($projectConfigTime -lt $buildStartedAt -or $gameConfigTime -lt $buildStartedAt) {
        throw 'Cocos Creator did not create a fresh WeChat build within 15 minutes. Check the Creator build log.'
    }

    Write-Host "Build completed: $buildRoot"
    if ($trimmedAppId -eq $testAppId) {
        Write-Warning 'The Cocos test AppId is for local debugging only. Pass your own AppId before previewing on a device or uploading.'
    }
}

Assert-WeChatBuildOutput

# Platform options passed as flat CLI parameters can be ignored by Creator 3.8.
# Apply the requested AppId to the generated WeChat project explicitly.
if (-not $SkipBuild) {
    $wechatConfig = Get-Content -LiteralPath $projectConfigPath -Raw | ConvertFrom-Json
    $wechatConfig.appid = $AppId.Trim()
    $wechatConfig | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $projectConfigPath -Encoding utf8
}

$totalBytes = (Get-ChildItem -LiteralPath $buildRoot -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host "Export size: $totalBytes bytes"
if ($totalBytes -ge 4000000) {
    throw "Export exceeds the 4 MB budget: $totalBytes bytes."
}

if ($Open) {
    if ([string]::IsNullOrWhiteSpace($WeChatCliPath)) {
        $WeChatCliPath = Get-ChildItem -LiteralPath 'D:\Program Files (x86)\Tencent' -Filter 'cli.bat' -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like '*web*' } |
            Select-Object -First 1 -ExpandProperty FullName
    }

    if (-not (Test-Path -LiteralPath $WeChatCliPath -PathType Leaf)) {
        throw "WeChat DevTools CLI was not found: $WeChatCliPath"
    }

    Write-Host 'Opening the build in WeChat DevTools...'
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()
    try {
        $cmdArguments = '/d /s /c ""{0}" open --project "{1}""' -f $WeChatCliPath, $buildRoot
        $cliProcess = Start-Process -FilePath $env:ComSpec -ArgumentList $cmdArguments -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        $cliExitCode = $cliProcess.ExitCode
        $cliText = @(
            Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue
            Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
        ) -join [Environment]::NewLine
    }
    finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
    Write-Host $cliText

    if ($cliText -match 'IDE service port disabled') {
        $devToolsDirectory = Split-Path -Parent $WeChatCliPath
        $devToolsExe = Get-ChildItem -LiteralPath $devToolsDirectory -Filter '*.exe' -File |
            Where-Object { $_.Length -gt 50MB } |
            Sort-Object Length -Descending |
            Select-Object -First 1 -ExpandProperty FullName

        if ($devToolsExe) {
            Start-Process -FilePath $devToolsExe -WindowStyle Hidden
        }

        Write-Warning "The DevTools service port is disabled. Import this directory from the entrance screen: $buildRoot"
        return
    }

    if ($cliExitCode -ne 0 -or $cliText -match '\[error\]') {
        throw "WeChat DevTools failed with exit code: $cliExitCode"
    }
}
