$ErrorActionPreference='Stop'
$designWorkspace='D:\codeX\create'
$designRoot=[IO.Path]::GetFullPath((Join-Path $designWorkspace 'design'))
$latestDesign=[IO.Path]::GetFullPath((Join-Path $designRoot 'all-pages-ninepatch-20261030'))
$designManifest=Get-Content -LiteralPath (Join-Path $latestDesign 'manifest.json') -Raw | ConvertFrom-Json
if (-not $designManifest.complete -or $designManifest.verifiedPngHeaders -ne 1308) { throw 'Latest design is not complete; cleanup cancelled.' }
function Assert-DesignChild([string]$target) {
  $resolved=[IO.Path]::GetFullPath($target)
  if (-not $resolved.StartsWith($designRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw "Outside design directory: $resolved" }
  if ($resolved -eq $latestDesign) { throw 'Latest design must be preserved.' }
  if ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked target rejected: $resolved" }
  return $resolved
}
$artRoot=Join-Path $latestDesign 'source-art'
New-Item -ItemType Directory -Path $artRoot -Force | Out-Null
$savedArt=@()
foreach($designId in @('01','04','08','09')) {
  foreach($source in @(@("ui-4themes-720x1280-20261030\assets\bg-$designId-source.png","bg-$designId-source.png"),@("reference-replica-20261030\source\shell-$designId.png","shell-$designId-source.png"))) {
    $original=Join-Path $designRoot $source[0]
    $destination=Join-Path $artRoot $source[1]
    Copy-Item -LiteralPath $original -Destination $destination
    if((Get-Item -LiteralPath $destination).Length -ne (Get-Item -LiteralPath $original).Length){throw 'Source art backup failed.'}
    $savedArt+=$source[1]
  }
}
foreach($source in @(@('reference-replica-20261030\source\tiles-source.png','tiles-source.png'),@('ingredients-1489-20261029\atlas-a-source.png','food-atlas-a-source.png'),@('ingredients-1489-20261029\atlas-b-source.png','food-atlas-b-source.png'))) {
  Copy-Item -LiteralPath (Join-Path $designRoot $source[0]) -Destination (Join-Path $artRoot $source[1])
  $savedArt+=$source[1]
}
$evidenceRoot=[IO.Path]::GetFullPath((Join-Path $designWorkspace '.codex-work\ui-runtime-evidence-20261030'))
if(-not $evidenceRoot.StartsWith($designWorkspace+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Evidence destination outside workspace.'}
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$movedEvidence=@()
foreach($name in @('implemented-1279','implemented-1489','asset-audit-20261030','screenfit-20261030')) {
  if(-not (Test-Path -LiteralPath (Join-Path $designRoot $name))){$movedEvidence+=$name;continue}
  $target=Assert-DesignChild (Join-Path $designRoot $name)
  $destination=[IO.Path]::GetFullPath((Join-Path $evidenceRoot $name))
  if(-not $destination.StartsWith($evidenceRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe evidence target.'}
  if(Test-Path -LiteralPath $destination){throw "Evidence destination already exists: $destination"}
  Move-Item -LiteralPath $target -Destination $destination
  $movedEvidence+=$name
}
$partialRuntime=Join-Path $evidenceRoot 'implemented-720-20261030'
if(Test-Path -LiteralPath $partialRuntime){
  $originalRuntime=Join-Path $designRoot 'implemented-720-20261030'
  foreach($entry in Get-ChildItem -LiteralPath $partialRuntime -File){$restoreFile=Join-Path $originalRuntime $entry.Name;if(-not(Test-Path -LiteralPath $restoreFile)){Move-Item -LiteralPath $entry.FullName -Destination $restoreFile}}
  if(@(Get-ChildItem -LiteralPath $partialRuntime -Force).Count -eq 0){Remove-Item -LiteralPath $partialRuntime}
}
$oldDraftNames=@('first-level-responsive-20261030','home-ninepatch-20261030','home-ninepatch-4themes-20261030','ingredients-1489-20261029','reference-replica-20261030','selected-1-7-9','style-exploration','style7-review-20261029','ui-4themes-720x1280-20261030','ui-c-ingredients','ui-expanded-1489-2026-10-29')
$checkedTargets=@($oldDraftNames | ForEach-Object { Assert-DesignChild (Join-Path $designRoot $_) })
foreach($target in $checkedTargets){Remove-Item -LiteralPath $target -Recurse -Force}
$designZip=Join-Path $designWorkspace 'exports\HotPot-UI-720x1280-design-20261030.zip'
if(Test-Path -LiteralPath $designZip){Remove-Item -LiteralPath $designZip -Force}
$latestScratch=Join-Path $latestDesign 'smoke'
if(Test-Path -LiteralPath $latestScratch){$safeScratch=[IO.Path]::GetFullPath($latestScratch);if(-not $safeScratch.StartsWith($latestDesign+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe smoke directory.'};Remove-Item -LiteralPath $safeScratch -Recurse -Force}
foreach($name in @('prepare.cjs','smoke-checks.json','render-progress.json','game-source-before.json')) { $scratch=Join-Path $latestDesign $name;if(Test-Path -LiteralPath $scratch){Remove-Item -LiteralPath $scratch -Force} }
@{latestDesign=$latestDesign;removedUiDrafts=$oldDraftNames;removedOldDesignZip=$designZip;savedSourceArt=$savedArt;runtimeEvidenceMovedTo=$evidenceRoot;runtimeEvidenceFolders=$movedEvidence;preservedCurrentGameRuntimeEvidence='implemented-720-20261030';preservedSeparateMarketingDesign='promo-cover-20261030';productionGameFilesEdited=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $latestDesign 'cleanup-report.json') -Encoding utf8
Write-Output 'Cleanup complete: 11 obsolete UI draft folders removed; runtime evidence and original art sources preserved.'
