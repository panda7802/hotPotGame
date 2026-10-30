$ErrorActionPreference='Stop'
$designWorkspace=[IO.Path]::GetFullPath('D:\codeX\create')
$designRoot=Join-Path $designWorkspace 'design'
$latestDesign=Join-Path $designRoot 'all-pages-ninepatch-20261030'
$audit=Get-Content -LiteralPath (Join-Path $latestDesign 'final-audit.json') -Raw | ConvertFrom-Json
if(-not $audit.complete -or $audit.fullScreenPngs -ne 1320){throw 'Latest design has not passed verification.'}
function Assert-CleanupTarget([string]$target){
  $resolved=[IO.Path]::GetFullPath($target)
  if(-not $resolved.StartsWith($designWorkspace+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Outside workspace: $resolved"}
  if($resolved -eq $latestDesign -or $resolved -eq $designRoot -or $resolved -eq $designWorkspace){throw "Protected directory: $resolved"}
  if(Test-Path -LiteralPath $resolved){
    if((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked target rejected: $resolved"}
    if((Get-Item -LiteralPath $resolved).PSIsContainer){
      if(@(Get-ChildItem -LiteralPath $resolved -Recurse -Force -Attributes ReparsePoint).Count){throw "Directory contains linked files: $resolved"}
    }
  }
  return $resolved
}
$obsoleteDirectories=@(
  (Join-Path $designRoot 'implemented-720-20261030'),
  (Join-Path $designRoot 'promo-cover-20261030'),
  (Join-Path $designWorkspace '.codex-work\ui-runtime-evidence-20261030')
) | ForEach-Object {Assert-CleanupTarget $_}
$oldExportImages=@(Get-ChildItem -LiteralPath (Join-Path $designWorkspace 'exports') -File -Filter '*.png' | ForEach-Object {Assert-CleanupTarget $_.FullName})
$coverSource=Join-Path $designRoot 'promo-cover-20261030'
$coverDestination=Join-Path $latestDesign 'assets\cover'
if(Test-Path -LiteralPath $coverSource){
  New-Item -ItemType Directory -Path $coverDestination -Force | Out-Null
  foreach($file in Get-ChildItem -LiteralPath $coverSource -File){
    $destination=Join-Path $coverDestination $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $destination
    if((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash){throw 'Latest cover copy failed verification.'}
  }
}
foreach($target in $obsoleteDirectories){if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}}
foreach($target in $oldExportImages){Remove-Item -LiteralPath $target -Force}
$progress=Join-Path $latestDesign 'render-progress.json'
if(Test-Path -LiteralPath $progress){Remove-Item -LiteralPath $progress -Force}
$reportPath=Join-Path $latestDesign 'cleanup-report.json'
$report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$report | Add-Member -NotePropertyName finalCleanup -NotePropertyValue @{
  removedDirectories=$obsoleteDirectories
  removedOldExportPreviews=$oldExportImages
  currentCoverConsolidatedTo=$coverDestination
  remainingDesignDirectories=@(Get-ChildItem -LiteralPath $designRoot -Directory | ForEach-Object Name)
  archivedOldDesignsRetained=$false
} -Force
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8
if(@(Get-ChildItem -LiteralPath $designRoot -Directory).Count -ne 1){throw 'Unexpected design directories remain.'}
$pngCount=@(Get-ChildItem -LiteralPath (Join-Path $latestDesign 'png') -File -Recurse -Filter '*.png').Count
$componentCount=@(Get-ChildItem -LiteralPath (Join-Path $latestDesign 'components') -File -Recurse -Filter '*.png').Count
if($pngCount -ne 1320 -or $componentCount -ne 84){throw 'Latest design files do not match verified counts.'}
Write-Output "Cleanup complete: only all-pages-ninepatch-20261030 remains in design; removed $($oldExportImages.Count) old preview images and all archived old design records. Latest 1320 screens and 84 components retained."
