$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}

$sql = [System.IO.File]::ReadAllText("d:\Projects\IS_SYSTEM_TEST\recreate_acc_nom.sql")
$queries = $sql -split ';'
foreach ($q in $queries) {
    if ([string]::IsNullOrWhiteSpace($q)) { continue }
    $q = $q + ';'
    $q | Out-File "temp.sql" -Encoding UTF8
    .\supabase.exe db query -f "temp.sql" --db-url $dbUrl
}
if (Test-Path "temp.sql") { Remove-Item "temp.sql" }
