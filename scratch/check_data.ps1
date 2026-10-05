$supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/acc_nomenklatura?%D0%9D%D0%BE%D0%BC%D0%B5%D1%80=eq.21129000B'
$supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
}

$response = Invoke-RestMethod -Uri $supabaseUrl -Method Get -Headers $headers
$response | ConvertTo-Json -Depth 3
