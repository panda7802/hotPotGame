param([ValidateSet('wechatgame','web-mobile')][string]$Platform='wechatgame')
$ErrorActionPreference='Stop'
$taskSource=Split-Path -Parent $PSScriptRoot
$taskRepo=Split-Path -Parent (Split-Path -Parent $taskSource)
$taskRoot=Join-Path $taskRepo 'tmp\game-club-page-manager-build-20261103'
$taskProject=Join-Path $taskRoot 'app\HotPot'
$taskCreator='D:\ProgramData\cocos\editor\Creator\3.8.8\CocosCreator.exe'
if(-not(Test-Path -LiteralPath $taskCreator)){
  $taskCreator='C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe'
}
if(-not(Test-Path -LiteralPath $taskCreator)){throw 'Creator 3.8.8 is required.'}
New-Item -ItemType Directory -Force -Path $taskProject | Out-Null
foreach($taskFolder in @('assets','settings','extensions','tools','cloudfunctions','build-templates','.creator')){
  $taskFrom=Join-Path $taskSource $taskFolder
  if(Test-Path -LiteralPath $taskFrom){
    $taskTo=Join-Path $taskProject $taskFolder
    New-Item -ItemType Directory -Force -Path $taskTo | Out-Null
    Copy-Item -Path (Join-Path $taskFrom '*') -Destination $taskTo -Recurse -Force
  }
}
foreach($taskFile in @('package.json','tsconfig.json','engine-mangle-config.json')){
  Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskProject -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'doc') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo 'doc\res') -Destination (Join-Path $taskRoot 'doc') -Recurse -Force
$taskConfig=Join-Path $taskProject 'tools\wechat-cloud-dev.build.json'
$taskOutput='wechatgame-cloud-dev'
if($Platform -eq 'web-mobile'){
  $taskOutput='web-game-club'
  $taskSettings=Get-Content -LiteralPath $taskConfig -Raw | ConvertFrom-Json
  $taskSettings.platform=$Platform
  $taskSettings.outputName=$taskOutput
  $taskSettings.taskName=$taskOutput
  $taskSettings.mainBundleCompressionType='merge_dep'
  $taskSettings.packages=[pscustomobject]@{'web-mobile'=[pscustomobject]@{orientation='portrait';embedWebDebugger=$false}}
  $taskConfig=Join-Path $taskProject 'tools\web-game-club.build.json'
  [IO.File]::WriteAllText($taskConfig,($taskSettings|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
}
$taskLogs=Join-Path $taskRepo 'tmp\game-club-page-manager-verification-20261103'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskOptions="platform=$Platform;buildPath=project://build;outputName=$taskOutput;configPath="+$taskConfig.Replace('\','/')
$taskProcess=Start-Process -FilePath $taskCreator -WindowStyle Hidden -PassThru -ArgumentList @('--project',$taskProject,'--build',$taskOptions) -RedirectStandardOutput (Join-Path $taskLogs ($Platform+'-stdout.log')) -RedirectStandardError (Join-Path $taskLogs ($Platform+'-stderr.log'))
$taskHandle=$taskProcess.Handle
$taskProcess.WaitForExit()
$taskProcess.Refresh()
if($taskProcess.ExitCode -ne 36){throw "Creator build failed ($($taskProcess.ExitCode)); inspect $taskLogs"}
if($Platform -eq 'wechatgame'){
  & node (Join-Path $taskProject 'tools\cloud-build-pipeline.cjs')
  if($LASTEXITCODE -ne 0){throw 'WeChat build verification failed.'}
}
Write-Output "Build ready: $taskProject\build\$taskOutput"
