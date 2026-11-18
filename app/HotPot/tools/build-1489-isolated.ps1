param([ValidateSet('wechatgame','web-mobile')][string]$Platform='wechatgame')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$copyRoot=Join-Path $sourceRoot 'tmp\build-1489-20261030'
$project=Join-Path $copyRoot 'app\HotPot'
$creator='C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe'
$env:COCOS_CREATOR_388=Split-Path -Parent $creator
if (-not (Test-Path -LiteralPath $copyRoot)) {
    & git clone --quiet --no-checkout --shared --branch codex/cloudbase-player-save $sourceRoot $copyRoot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated build repository.' }
    New-Item -ItemType Directory -Force $project | Out-Null
    foreach($folder in @('assets','settings','extensions','tools','cloudfunctions','build-templates','.creator')) {
        $from=Join-Path (Join-Path $sourceRoot 'app\HotPot') $folder
        if(Test-Path -LiteralPath $from){ Copy-Item -LiteralPath $from -Destination $project -Recurse }
    }
    foreach($name in @('package.json','tsconfig.json','engine-mangle-config.json')) {
        Copy-Item -LiteralPath (Join-Path (Join-Path $sourceRoot 'app\HotPot') $name) -Destination $project
    }
    New-Item -ItemType Directory -Force (Join-Path $copyRoot 'doc') | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'doc\res') -Destination (Join-Path $copyRoot 'doc') -Recurse
}
# Carry source refinements into subsequent cached builds of this isolated copy.
Copy-Item -Path (Join-Path $sourceRoot 'app\HotPot\assets\scripts\*') -Destination (Join-Path $project 'assets\scripts') -Recurse -Force
Copy-Item -Path (Join-Path $sourceRoot 'app\HotPot\assets\resources\*') -Destination (Join-Path $project 'assets\resources') -Recurse -Force
$config=Join-Path $project 'tools\wechat-cloud-dev.build.json'
$output='wechatgame-cloud-dev'
if($Platform -eq 'web-mobile') {
    $output='web1489'
    $settings=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    $settings.platform='web-mobile'
    $settings.outputName=$output
    $settings.taskName=$output
    $settings.mainBundleCompressionType='merge_dep'
    $settings.packages=[pscustomobject]@{'web-mobile'=[pscustomobject]@{orientation='portrait';embedWebDebugger=$false}}
    $config=Join-Path $project 'tools\web1489.build.json'
    [IO.File]::WriteAllText($config,($settings|ConvertTo-Json -Depth 30),(New-Object Text.UTF8Encoding($false)))
}
$options="platform=$Platform;buildPath=project://build;outputName=$output;configPath="+$config.Replace('\','/')
$outLog=Join-Path $copyRoot ($Platform+'-stdout.log')
$errLog=Join-Path $copyRoot ($Platform+'-stderr.log')
$buildProcess=Start-Process -FilePath $creator -WindowStyle Hidden -PassThru -ArgumentList @('--project',$project,'--build',$options) -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Write-Output "Building isolated $Platform project: $project (PID $($buildProcess.Id))"
while(-not $buildProcess.HasExited){ Start-Sleep -Seconds 2; $buildProcess.Refresh() }
if($buildProcess.ExitCode -ne 36){ throw "Cocos build failed ($($buildProcess.ExitCode)); inspect $outLog and $errLog" }
Write-Output "Cocos success, exit 36: $project\build\$output"
if($Platform -eq 'wechatgame') {
    & node (Join-Path $project 'tools\cloud-build-pipeline.cjs')
    if($LASTEXITCODE -ne 0){ throw 'Final build validation failed.' }
}
