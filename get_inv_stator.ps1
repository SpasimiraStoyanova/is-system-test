$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/inventory?select=*&ID%20Детайл=ilike.*СТАТОР*"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
}
Invoke-RestMethod -Uri $url -Headers $headers | ConvertTo-Json -Depth 5 > D:\Projects\IS_SYSTEM_TEST\check_inv_stator.json
