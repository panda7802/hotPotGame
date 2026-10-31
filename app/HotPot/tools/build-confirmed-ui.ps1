param([ValidateSet('web-mobile','wechatgame')][string]$Platform='web-mobile')
$ErrorActionPreference='Stop'
$taskOriginal=Split-Path -Parent $PSScriptRoot
$taskRepo=Split-Path -Parent (Split-Path -Parent $taskOriginal)
$taskCopy=Join-Path $taskRepo 'tmp\build-confirmed-ui-20261030'
$taskProject=Join-Path $taskCopy 'app\HotPot'
$taskCreator='C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe'
if(-not(Test-Path -LiteralPath $taskCreator)){throw 'Cocos Creator 3.8.8 is required.'}
New-Item -ItemType Directory -Force -Path $taskProject | Out-Null
foreach($taskFolder in @('assets','settings','extensions','tools','cloudfunctions','build-templates','.creator')){
  $taskFrom=Join-Path $taskOriginal $taskFolder
  if(Test-Path -LiteralPath $taskFrom){
    New-Item -ItemType Directory -Force -Path (Join-Path $taskProject $taskFolder) | Out-Null
    Copy-Item -Path (Join-Path $taskFrom '*') -Destination (Join-Path $taskProject $taskFolder) -Recurse -Force
  }
}
foreach($taskName in @('package.json','tsconfig.json','engine-mangle-config.json')){Copy-Item -LiteralPath (Join-Path $taskOriginal $taskName) -Destination $taskProject -Force}
New-Item -ItemType Directory -Force -Path (Join-Path $taskCopy 'doc') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo 'doc\res') -Destination (Join-Path $taskCopy 'doc') -Recurse -Force
$taskLogs=Join-Path $taskRepo '.codex-work\confirmed-ui'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskConfig=Join-Path $taskProject 'tools\wechat-cloud-dev.build.json'
$taskOutput='wechatgame-cloud-dev'
if($Platform -eq 'web-mobile'){
  $taskOutput='web-confirmed-ui'
  $taskSettings=Get-Content -LiteralPath $taskConfig -Raw | ConvertFrom-Json
  $taskSettings.platform=$Platform;$taskSettings.outputName=$taskOutput;$taskSettings.taskName=$taskOutput
  $taskSettings.mainBundleCompressionType='merge_dep'
  $taskSettings.packages=[pscustomobject]@{'web-mobile'=[pscustomobject]@{orientation='portrait';embedWebDebugger=$false}}
  $taskConfig=Join-Path $taskProject 'tools\web-confirmed-ui.build.json'
  [IO.File]::WriteAllText($taskConfig,($taskSettings|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
}
$taskOptions="platform=$Platform;buildPath=project://build;outputName=$taskOutput;configPath="+$taskConfig.Replace('\','/')
Write-Output "Building confirmed UI: $Platform"
$taskProcess=Start-Process -FilePath $taskCreator -WindowStyle Hidden -PassThru -ArgumentList @('--project',$taskProject,'--build',$taskOptions) -RedirectStandardOutput (Join-Path $taskLogs ($Platform+'-stdout.log')) -RedirectStandardError (Join-Path $taskLogs ($Platform+'-stderr.log'))
$taskProcessHandle=$taskProcess.Handle
$taskProcess.WaitForExit()
$taskProcess.Refresh()
if($taskProcess.ExitCode -ne 36){throw "Cocos build failed ($($taskProcess.ExitCode)); inspect $taskLogs"}
if($Platform -eq 'wechatgame'){
  & node (Join-Path $taskProject 'tools\cloud-build-pipeline.cjs')
  if($LASTEXITCODE -ne 0){throw 'WeChat post-build verification failed.'}
}
Write-Output "Build succeeded: $taskProject\build\$taskOutput"
