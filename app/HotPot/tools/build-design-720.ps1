param([ValidateSet('wechatgame','web-mobile')][string]$Platform='web-mobile')
$ErrorActionPreference='Stop'
$taskProject=Split-Path -Parent $PSScriptRoot
$taskRepo=Split-Path -Parent (Split-Path -Parent $taskProject)
$taskCreator='D:\ProgramData\cocos\editor\Creator\3.8.8\CocosCreator.exe'
if(-not(Test-Path -LiteralPath $taskCreator)) { $taskCreator='C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe' }
if(-not(Test-Path -LiteralPath $taskCreator)) { throw 'Cocos Creator 3.8.8 is required.' }
$taskCopy=Join-Path $taskRepo 'tmp\build-ui720-20261030'
if(-not(Test-Path -LiteralPath (Join-Path $taskCopy '.git'))) {
  if(Test-Path -LiteralPath $taskCopy){throw 'Unrecognized isolated build directory.'}
  & git clone --quiet --no-checkout --shared --branch codex/cloudbase-player-save $taskRepo $taskCopy
  if($LASTEXITCODE -ne 0){throw 'Cannot create isolated build copy.'}
}
$taskOriginal=$taskProject
$taskProject=Join-Path $taskCopy 'app\HotPot'
New-Item -ItemType Directory -Force -Path $taskProject | Out-Null
foreach($taskFolder in @('assets','settings','extensions','tools','cloudfunctions','build-templates','.creator')) {
  $taskFrom=Join-Path $taskOriginal $taskFolder
  if(Test-Path -LiteralPath $taskFrom){
    New-Item -ItemType Directory -Force -Path (Join-Path $taskProject $taskFolder) | Out-Null
    Copy-Item -Path (Join-Path $taskFrom '*') -Destination (Join-Path $taskProject $taskFolder) -Recurse -Force
  }
}
foreach($taskName in @('package.json','tsconfig.json','engine-mangle-config.json')){Copy-Item -LiteralPath (Join-Path $taskOriginal $taskName) -Destination $taskProject -Force}
New-Item -ItemType Directory -Force -Path (Join-Path $taskCopy 'doc') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo 'doc\res') -Destination (Join-Path $taskCopy 'doc') -Recurse -Force
$taskLogRoot=Join-Path $taskRepo 'design\implemented-720-20261030'
New-Item -ItemType Directory -Force -Path $taskLogRoot | Out-Null
$taskTools=Join-Path $taskProject 'tools'
$taskConfig=Join-Path $taskTools 'wechat-cloud-dev.build.json'
$taskOutput='wechatgame-cloud-dev'
if($Platform -eq 'web-mobile') {
  $taskOutput='web-ui720'
  $taskSettings=Get-Content -LiteralPath $taskConfig -Raw | ConvertFrom-Json
  $taskSettings.platform='web-mobile'
  $taskSettings.outputName=$taskOutput
  $taskSettings.taskName=$taskOutput
  $taskSettings.mainBundleCompressionType='merge_dep'
  $taskSettings.packages=[pscustomobject]@{'web-mobile'=[pscustomobject]@{orientation='portrait';embedWebDebugger=$false}}
  $taskConfig=Join-Path $taskTools 'web-ui720.build.json'
  [IO.File]::WriteAllText($taskConfig,($taskSettings|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
}
$taskOptions="platform=$Platform;buildPath=project://build;outputName=$taskOutput;configPath="+$taskConfig.Replace('\','/')
Write-Output "Building $Platform"
$taskProcess=Start-Process -FilePath $taskCreator -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--project',$taskProject,'--build',$taskOptions) -RedirectStandardOutput (Join-Path $taskLogRoot ($Platform+'-stdout.log')) -RedirectStandardError (Join-Path $taskLogRoot ($Platform+'-stderr.log'))
if($taskProcess.ExitCode -ne 36){throw "Cocos build failed ($($taskProcess.ExitCode)); inspect $taskLogRoot"}
Write-Output "Cocos build succeeded: $taskProject\build\$taskOutput"
if($Platform -eq 'wechatgame') {
  & node (Join-Path $taskTools 'cloud-build-pipeline.cjs')
  if($LASTEXITCODE -ne 0){throw 'WeChat build verification failed.'}
}
