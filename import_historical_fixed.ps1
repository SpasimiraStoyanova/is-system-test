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
        
        Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history?snapshot_date=eq.$dateStr" -Headers $headers -Method Delete
        
        $firstLine = Get-Content $csvPath -TotalCount 1 -Encoding UTF8
        $delim = ","
        if ($firstLine -match ";") {
            $delim = ";"
        }
        
        $csvData = Import-Csv -Path $csvPath -Delimiter $delim -Encoding UTF8
        
        $batch = @()
        foreach ($row in $csvData) {
            foreach ($prop in $row.psobject.properties) {
                if ($prop.Value -and $prop.Value -match "\d+,\d+") {
                    $row.($prop.Name) = $prop.Value.Replace(',', '.')
                }
                if ($prop.Value -eq "") {
                    $row.($prop.Name) = $null
                }
            }
            $row | Add-Member -MemberType NoteProperty -Name "snapshot_date" -Value $dateStr
            $batch += $row
            
            if ($batch.Count -ge 500) {
                $json = $batch | ConvertTo-Json -Depth 10 -Compress
                $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headers -Method Post -Body $jsonBytes
                $batch = @()
            }
        }
        
        if ($batch.Count -gt 0) {
            $json = $batch | ConvertTo-Json -Depth 10 -Compress
            $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/sklad_history" -Headers $headers -Method Post -Body $jsonBytes
        }
        Write-Host "Imported data for $dateStr."
    }
}
Write-Host "All historical data imported successfully!"
