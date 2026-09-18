$ErrorActionPreference = 'Stop'
$versions = Get-Content tooling/binaries/versions.json | ConvertFrom-Json
Invoke-WebRequest $versions.aria2.windowsX64 -OutFile "$env:RUNNER_TEMP/aria2.zip"
$actual = (Get-FileHash "$env:RUNNER_TEMP/aria2.zip" -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $versions.aria2.windowsX64Sha256) { throw 'aria2 archive checksum mismatch' }
Expand-Archive "$env:RUNNER_TEMP/aria2.zip" "$env:RUNNER_TEMP/aria2" -Force
$binaries = @(Get-ChildItem "$env:RUNNER_TEMP/aria2" -Recurse -Filter aria2c.exe)
if ($binaries.Count -ne 1) { throw 'Expected exactly one aria2 executable' }
$binary = $binaries[0]
"ARIA2_BIN=$($binary.FullName)" | Out-File -FilePath $env:GITHUB_ENV -Append
New-Item -ItemType Directory -Force licenses/aria2-windows | Out-Null
Get-ChildItem $binary.DirectoryName -File | Where-Object { $_.Extension -ne '.exe' } | Copy-Item -Destination licenses/aria2-windows
