$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath('D:\codeX\create')
$report=Get-Content -LiteralPath (Join-Path $workspace 'tmp\storage-cleanup-20261102.json') -Raw | ConvertFrom-Json
$checkedTargets=@()
foreach($entry in $report.deleted){
  $target=[IO.Path]::GetFullPath((Join-Path $workspace $entry.path))
  if(-not ($target.StartsWith($workspace+'\exports\',[StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($workspace+'\design\',[StringComparison]::OrdinalIgnoreCase))){throw "Outside cleanup scope: $target"}
  if(-not(Test-Path -LiteralPath $target)){continue}
  $item=Get-Item -LiteralPath $target -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked target rejected: $target"}
  if($item.PSIsContainer -and @(Get-ChildItem -LiteralPath $target -Recurse -Force -Attributes ReparsePoint).Count){throw "Directory contains linked paths: $target"}
  $checkedTargets+=$target
}
foreach($target in $checkedTargets){
  if((Get-Item -LiteralPath $target).PSIsContainer){Remove-Item -LiteralPath $target -Recurse -Force}
  else{Remove-Item -LiteralPath $target -Force}
}
Write-Output ('Removed '+$checkedTargets.Count+' explicitly audited obsolete export/design targets.')
