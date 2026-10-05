$supabaseUrl = "https://zdythzcgcjxwbxufunuh.supabase.co"
$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"

$headers = @{
    "apikey" = $apikey
    "Authorization" = "Bearer $apikey"
    "Content-Type" = "application/json"
}

$backupRoot = "D:\Supabase backup"
$folders = Get-ChildItem -Path $backupRoot -Directory

foreach ($folder in $folders) {
    $dateStr = $folder.Name
    $csvPath = Join-Path $folder.FullName "sklad.csv"
    
    if (Test-Path $csvPath) {
        Write-Host "Processing $dateStr ..."
        
        # Delete existing data for this date to avoid duplicates
        Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history?snapshot_date=eq.$dateStr" -Headers $headers -Method Delete
        
        # Determine delimiter
        $firstLine = Get-Content $csvPath -TotalCount 1
        $delim = ","
        if ($firstLine -match ";") {
            $delim = ";"
        }
        
        $csvData = Import-Csv -Path $csvPath -Delimiter $delim -Encoding UTF8
        
        $batch = @()
        foreach ($row in $csvData) {
            $record = @{
                "ID Детайл" = $row."ID Детайл"
                "Мерна единица" = $row."Мерна единица"
                "Начална наличност" = if ($row."Начална наличност") { [decimal]$row."Начална наличност".Replace(',', '.') } else { $null }
                "Доставено" = if ($row."Доставено") { [decimal]$row."Доставено".Replace(',', '.') } else { $null }
                "Изразходено" = if ($row."Изразходено") { [decimal]$row."Изразходено".Replace(',', '.') } else { $null }
                "Остатък" = if ($row."Остатък") { [decimal]$row."Остатък".Replace(',', '.') } else { $null }
                "Минимално количество" = if ($row."Минимално количество") { [decimal]$row."Минимално количество".Replace(',', '.') } else { $null }
                "Бележки" = $row."Бележки"
                "snapshot_date" = $dateStr
            }
            $batch += $record
            
            if ($batch.Count -ge 500) {
                $json = $batch | ConvertTo-Json -Depth 10 -Compress
                $json = [System.Text.Encoding]::UTF8.GetBytes($json)
                Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headers -Method Post -Body $json
                $batch = @()
            }
        }
        
        if ($batch.Count -gt 0) {
            $json = $batch | ConvertTo-Json -Depth 10 -Compress
            $json = [System.Text.Encoding]::UTF8.GetBytes($json)
            Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headers -Method Post -Body $json
        }
        Write-Host "Imported data for $dateStr."
    }
}
Write-Host "All historical data imported successfully!"
