param (
    [Parameter(Mandatory=$true)]
    [string]$SqlFile
)

if (-not (Test-Path ".env")) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}

if (-not $dbUrl) {
    Write-Host "Error: DATABASE_URL not found in .env" -ForegroundColor Red
    exit 1
}

Write-Host "Executing $SqlFile against Supabase..."
.\supabase.exe db query -f $SqlFile --db-url $dbUrl

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success!" -ForegroundColor Green
} else {
    Write-Host "Failed to execute SQL." -ForegroundColor Red
}
