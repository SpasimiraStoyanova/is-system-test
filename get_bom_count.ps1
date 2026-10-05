$url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/bom?select=count"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"
    "Prefer" = "count=exact"
}
try {
    $res = Invoke-WebRequest -Uri $url -Headers $headers -Method Head
    Write-Host "Count:" $res.Headers["Content-Range"]
} catch {
    Write-Host "Error"
}
