$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
}

Write-Host "=== MARSHRUTI ==="
$marshrutiUrl = $url + "/marshruti?select=*&%D0%9A%D0%BE%D0%B4+%D0%BD%D0%B0+%D0%B4%D0%B5%D1%82%D0%B0%D0%B9%D0%BB%D0%B0=ilike.%D1%88%D0%BF.+8-32"
$marshrutiResponse = Invoke-RestMethod -Uri $marshrutiUrl -Headers $headers
$marshrutiResponse | ConvertTo-Json -Depth 5

Write-Host "=== BOM ==="
$bomUrl = $url + "/bom?select=*&ID+%D0%A0%D0%BE%D0%B4%D0%B8%D1%82%D0%B5%D0%BB=ilike.%D1%88%D0%BF.+8-32"
$bomResponse = Invoke-RestMethod -Uri $bomUrl -Headers $headers
$bomResponse | ConvertTo-Json -Depth 5
