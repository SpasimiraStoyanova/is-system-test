$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
}

$planResponse = Invoke-RestMethod -Uri "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/plan?select=*" -Headers $headers -Method Get
Write-Output "PLANS:"
foreach ($p in $planResponse) {
    Write-Output "ID Det: $($p.'ID Детайл'), Vutreshno ime: $($p.'Вътрешно име'), Status: $($p.'Статус')"
}

$nomResponse = Invoke-RestMethod -Uri "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/%D0%9D%D0%BE%D0%BC%D0%B5%D0%BD%D0%BA%D0%BB%D0%B0%D1%82%D1%83%D1%80%D0%B0?select=*" -Headers $headers -Method Get
Write-Output "NOMS matching plan IDs:"
foreach ($p in $planResponse) {
    $nom = $nomResponse | Where-Object { $_.'ID Детайл' -eq $p.'ID Детайл' }
    if ($nom) {
        Write-Output "Found nom for $($p.'ID Детайл'): Vutreshno ime: $($nom.'Вътрешно име'), Parent: $($nom.'ID Родител')"
    }
}
