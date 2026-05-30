param(
  [switch]$Legacy
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$fastApiApp = "fastapi_server:app"
$legacyApiScript = Join-Path $scriptDir "api_server.py"
$hostName = if ($env:CFDMT_API_HOST) { $env:CFDMT_API_HOST } else { "127.0.0.1" }
$port = if ($env:CFDMT_API_PORT) { $env:CFDMT_API_PORT } else { "8000" }

function Test-ToolRoot($path) {
  if (-not $path) { return $false }
  return (Test-Path (Join-Path $path "app\services\scan_service.py")) -and
    (Test-Path (Join-Path $path "app\services\repair_service.py")) -and
    (Test-Path (Join-Path $path "app\core\integrity.py"))
}

if ($env:CFDMT_TOOL_ROOT) {
  $toolRoot = Resolve-Path $env:CFDMT_TOOL_ROOT
} else {
  $toolRoot = $null
  $relativeCandidates = @(
    "cfdmt_tool",
    "the final code\Corrupted File Detection and Management Tool",
    "ali\CFDMT-WEB"
  )
  $current = $repoRoot
  while ($current) {
    foreach ($relative in $relativeCandidates) {
      $candidate = Join-Path $current $relative
      if (Test-ToolRoot $candidate) {
        $toolRoot = Resolve-Path $candidate
        break
      }
    }
    if ($toolRoot) { break }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
}

if (-not $toolRoot) {
  throw "Could not find the CFDMT Python tool. Set CFDMT_TOOL_ROOT to the tool folder."
}
$env:CFDMT_TOOL_ROOT = $toolRoot
$env:PYTHONUTF8 = "1"

$pythonExe = $null
$pythonArgs = @()
if ($env:CFDMT_PYTHON) {
  $pythonExe = (Resolve-Path $env:CFDMT_PYTHON).Path
} else {
  $projectPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
  $toolWindowsPython = Join-Path $toolRoot ".venv\Scripts\python.exe"
  if (Test-Path $projectPython) {
    $pythonExe = $projectPython
  } elseif (Test-Path $toolWindowsPython) {
    $pythonExe = $toolWindowsPython
  } else {
    $pythonExe = "py"
    $pythonArgs = @("-3.10")
  }
}

if ($Legacy) {
  & $pythonExe @pythonArgs $legacyApiScript
  exit $LASTEXITCODE
}

& $pythonExe @pythonArgs -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "FastAPI dependencies are missing. Run: py -3.10 -m pip install -r backend\requirements.txt"
}

Write-Host "CFDMT FastAPI bridge running at http://$hostName`:$port"
Write-Host "Using CFDMT tool root: $toolRoot"
& $pythonExe @pythonArgs -m uvicorn $fastApiApp --host $hostName --port $port --app-dir $scriptDir
