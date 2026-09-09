$supabaseUrl = "https://aoekbmhgbohsgpwqsizv.supabase.co"
$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU"

$headers = @{
    "apikey" = $apikey
    "Authorization" = "Bearer $apikey"
    "Accept" = "application/json"
}

$tables = @(
    "otcheti", 
    "plan", 
    "bom", 
    "sklad", 
    "marshruti", 
    "inventory_gp", 
    "inventory_wip", 
    "sklad_bufferi", 
    "chekiraniya", 
    "Номенклатура"
)

$dateStr = Get-Date -Format "yyyy-MM-dd"
$backupDir = "D:\Supabase backup\$dateStr"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

foreach ($table in $tables) {
    Write-Host "Backing up table: $table"
    
    # URL encode table name for Cyrillic
    $encodedTable = [uri]::EscapeDataString($table)
    $url = "$supabaseUrl/rest/v1/$encodedTable?select=*"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        
        $filePath = Join-Path -Path $backupDir -ChildPath "$table.csv"
        
        if ($response -and $response.Count -gt 0) {
            $response | Export-Csv -Path $filePath -NoTypeInformation -Encoding UTF8
            Write-Host "Saved $table to $filePath"
        } else {
            Write-Host "Table $table is empty, created empty file."
            New-Item -ItemType File -Path $filePath -Force | Out-Null
        }
    } catch {
        Write-Host "Error backing up table $table : $_" -ForegroundColor Red
    }
}

Write-Host "Backup completed successfully!"
