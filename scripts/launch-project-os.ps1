param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppUrl = "http://127.0.0.1:4173"
$LogDirectory = Join-Path $env:LOCALAPPDATA "TaskCockpit"

function Find-Executable {
    param(
        [string]$CommandName,
        [string[]]$Candidates,
        [string]$RuntimePattern
    )

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
    }

    $runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes"
    if (Test-Path -LiteralPath $runtimeRoot -PathType Container) {
        $runtimeExecutable = Get-ChildItem -LiteralPath $runtimeRoot -Filter $CommandName -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like $RuntimePattern } |
            Select-Object -First 1
        if ($runtimeExecutable) {
            return $runtimeExecutable.FullName
        }
    }

    return $null
}

function Get-ServiceState {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $AppUrl -TimeoutSec 2
        if ($response.StatusCode -eq 200 -and $response.Content -match "Project OS") {
            return "ready"
        }
        return "occupied"
    }
    catch {
        if ($_.Exception.Response) {
            return "occupied"
        }
        return "offline"
    }
}

function Show-LaunchError {
    param([string]$Message)

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            $Message,
            "Project OS launch failed",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    catch {
        # The shortcut stays silent when Windows cannot display a message box.
    }
}

$nodeExecutable = Find-Executable -CommandName "node.exe" -Candidates @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
) -RuntimePattern "*\dependencies\node\bin\node.exe"

$gitExecutable = Find-Executable -CommandName "git.exe" -Candidates @(
    (Join-Path $env:ProgramFiles "Git\cmd\git.exe"),
    "D:\Git\cmd\git.exe",
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
) -RuntimePattern "*\dependencies\native\git\cmd\git.exe"

$serviceState = Get-ServiceState

if ($CheckOnly) {
    [PSCustomObject]@{
        ProjectRoot = $ProjectRoot
        ServerScriptExists = Test-Path -LiteralPath (Join-Path $ProjectRoot "scripts\serve.mjs") -PathType Leaf
        NodeExecutable = $nodeExecutable
        GitExecutable = $gitExecutable
        ServiceState = $serviceState
        AppUrl = $AppUrl
    }
    exit 0
}

if ($serviceState -eq "ready") {
    Start-Process -FilePath $AppUrl
    exit 0
}

if ($serviceState -eq "occupied") {
    Show-LaunchError "Port 4173 is being used by another application. Close it and try again."
    exit 1
}

$serverScript = Join-Path $ProjectRoot "scripts\serve.mjs"
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    Show-LaunchError "Project OS was not found at: $ProjectRoot"
    exit 1
}

if (-not $nodeExecutable) {
    Show-LaunchError "Node.js was not found. Install Node.js 20 or start Codex once, then try again."
    exit 1
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
if ($gitExecutable) {
    $env:PROJECT_OS_GIT_PATH = $gitExecutable
}

Start-Process -FilePath $nodeExecutable `
    -ArgumentList "scripts\serve.mjs" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDirectory "server.log") `
    -RedirectStandardError (Join-Path $LogDirectory "server-error.log")

for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 750
    if ((Get-ServiceState) -eq "ready") {
        Start-Process -FilePath $AppUrl
        exit 0
    }
}

Show-LaunchError "The local service did not become ready. Logs: $LogDirectory"
exit 1
