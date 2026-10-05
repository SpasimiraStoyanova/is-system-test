$supabaseUrl = "https://zdythzcgcjxwbxufunuh.supabase.co"
$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"

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
$backupDir = "D:\Supabase backup TEST\$dateStr"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

foreach ($table in $tables) {
    Write-Host "Backing up table: $table"
    
    $cleanTable = $table.Trim()
    
    if ($cleanTable -eq "Номенклатура") {
        $encodedTable = "%D0%9D%D0%BE%D0%BC%D0%B5%D0%BD%D0%BA%D0%BB%D0%B0%D1%82%D1%83%D1%80%D0%B0"
        $fileName = "Nomenklatura"
    } else {
        $encodedTable = [uri]::EscapeDataString($cleanTable)
        $fileName = $cleanTable
    }
    
    $url = "$supabaseUrl/rest/v1/${encodedTable}?select=*"
    Write-Host "URL: $url"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        
        $filePath = Join-Path -Path $backupDir -ChildPath "$fileName.csv"
        
        if ($response -and $response.Count -gt 0) {
            $response | Export-Csv -Path $filePath -NoTypeInformation -Encoding UTF8 -Delimiter ";"
            Write-Host "Saved $table to $filePath"
        } else {
            Write-Host "Table $table is empty, created empty file."
            New-Item -ItemType File -Path $filePath -Force | Out-Null
        }
    } catch {
        Write-Host "Error backing up table $table : $_" -ForegroundColor Red
    }
}

Write-Host "Taking snapshot for sklad_history via REST..."
try {
    # 1. Clear any existing records for today
    Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history?snapshot_date=eq.$dateStr" -Headers $headers -Method Delete -ErrorAction SilentlyContinue

    # 2. Fetch current sklad
    $skladData = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad?select=*" -Headers $headers -Method Get

    # 3. Add date and post to history
    if ($skladData) {
        $headersPost = $headers.Clone()
        $headersPost["Content-Type"] = "application/json"
        
        $batch = @()
        foreach ($row in $skladData) {
            $row | Add-Member -MemberType NoteProperty -Name "snapshot_date" -Value $dateStr -Force
            $batch += $row
            
            if ($batch.Count -ge 500) {
                $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes(($batch | ConvertTo-Json -Depth 10 -Compress))
                Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headersPost -Method Post -Body $jsonBytes
                $batch = @()
            }
        }
        if ($batch.Count -gt 0) {
            $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes(($batch | ConvertTo-Json -Depth 10 -Compress))
            Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headersPost -Method Post -Body $jsonBytes
        }
        Write-Host "Successfully saved sklad_history snapshot via REST!"
    }
} catch {
    Write-Host "Failed to take snapshot: $_" -ForegroundColor Red
}

Write-Host "Backup completed successfully!"
