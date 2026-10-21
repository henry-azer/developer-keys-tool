# Runs Developer Keys from this folder at https://localhost:53917.
#   .\run-developer-keys.ps1              build if needed, then start the host
#   .\run-developer-keys.ps1 -Rebuild     rebuild the web app and host first
#   .\run-developer-keys.ps1 -Open        also open it in the browser
#   .\run-developer-keys.ps1 -Stop        stop the running host
# Windows sign-in runs this script (HKCU\...\Run "Developer Keys").
param([switch]$Rebuild, [switch]$Open, [switch]$Stop)

$root   = $PSScriptRoot
$outDir = Join-Path $root 'release\local'
$exe    = Join-Path $outDir 'developer-keys.Host.exe'
$url    = 'https://localhost:53917'

function Get-DeveloperKeysProcess { Get-Process -Name 'developer-keys.Host', 'developer-keys' -ErrorAction SilentlyContinue }

if ($Stop) { Get-DeveloperKeysProcess | Stop-Process -Force; 'Developer Keys stopped.'; return }

if ($Rebuild -or -not (Test-Path (Join-Path $root 'web\dist\index.html'))) {
    Push-Location (Join-Path $root 'web')
    try {
        if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' } }
        npm run build; if ($LASTEXITCODE) { throw 'web build failed' }
    } finally { Pop-Location }
}

if ($Rebuild -or -not (Test-Path $exe)) {
    if (Get-Process -Name 'developer-keys.Host' -ErrorAction SilentlyContinue) { Get-Process -Name 'developer-keys.Host' | Stop-Process -Force }
    dotnet publish (Join-Path $root 'host') -c Release -r win-x64 --self-contained false -o $outDir
    if ($LASTEXITCODE) { throw 'host build failed' }
}

if (Get-DeveloperKeysProcess) {
    "Developer Keys is already running at $url"
} else {
    Start-Process -FilePath $exe -WorkingDirectory $outDir -WindowStyle Hidden
    "Developer Keys started at $url"
}
if ($Open) { Start-Process $url }
