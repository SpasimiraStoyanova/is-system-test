$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/plan?select=*&Вътрешно%20име=ilike.*25*"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
}
Invoke-RestMethod -Uri $url -Headers $headers | ConvertTo-Json -Depth 5 > D:\Projects\IS_SYSTEM_TEST\check_plans25.json
Get-Content D:\Projects\IS_SYSTEM_TEST\check_plans25.json -Encoding Unicode | Out-File D:\Projects\IS_SYSTEM_TEST\check_plans25_utf8.json -Encoding utf8
