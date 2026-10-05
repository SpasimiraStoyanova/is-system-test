$headers = @{ 'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE' }
$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/bom?select=ID%20Родител,ID%20Компонент&limit=20000"
$res = Invoke-RestMethod -Uri $url -Headers $headers
$res | ConvertTo-Json -Depth 5 > D:\Projects\IS_SYSTEM_TEST\check_bom_full.json
Write-Host "SUCCESS"
