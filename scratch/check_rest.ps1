$supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/acc_nomenklatura?limit=1'
$supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
}

try {
    $response = Invoke-RestMethod -Uri $supabaseUrl -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 2
} catch {
    $_.Exception.Response | Out-String
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $reader.ReadToEnd()
}
