$ErrorActionPreference = "Stop"

$defender = "$env:ProgramFiles\Windows Defender\MpCmdRun.exe"
if (-not (Test-Path $defender)) {
  throw "Microsoft Defender command-line scanner is unavailable"
}

function Write-DefenderDiagnostics {
  Write-Host "Microsoft Defender threat catalog:"
  Get-MpThreat | Format-List * | Out-String | Write-Host

  Write-Host "Microsoft Defender detections:"
  Get-MpThreatDetection | Format-List * | Out-String | Write-Host

  $log = "$env:LOCALAPPDATA\Temp\MpCmdRun.log"
  if (Test-Path $log) {
    Write-Host "MpCmdRun log:"
    Get-Content $log | Write-Host
  }
}

& $defender -SignatureUpdate
if ($LASTEXITCODE -ne 0) {
  throw "Microsoft Defender signatures could not be updated"
}

$targets = @(
  Get-ChildItem "release\Fatture-Incassi-Pro-Setup-*.exe" -File
  Get-ChildItem "release\Fatture-Incassi-Pro-Portable-*.zip" -File -ErrorAction SilentlyContinue
  Get-ChildItem "release\win-unpacked" -File -Recurse
) | Select-Object -ExpandProperty FullName

foreach ($target in $targets) {
  Write-Host "Scanning $target"
  & $defender -Scan -ScanType 3 -File $target -DisableRemediation
  $scanExitCode = $LASTEXITCODE
  if ($scanExitCode -ne 0) {
    Write-DefenderDiagnostics
    throw "Microsoft Defender did not approve $target (exit code $scanExitCode)"
  }
}
