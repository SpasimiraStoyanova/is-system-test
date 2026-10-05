$config = Get-Content 'admin-config.json' | ConvertFrom-Json
$url = $config.supabaseUrl + '/rest/v1/bom?select=ID%20Родител,ID%20Компонент'
$headers = @{
    'apikey' = $config.supabaseKey
    'Authorization' = 'Bearer ' + $config.supabaseKey
}
$res = Invoke-RestMethod -Uri $url -Headers $headers
$res | Where-Object { $_.'ID Компонент' -match 'R3' } | Format-Table 'ID Родител', 'ID Компонент' -AutoSize
