$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}
$q = "SELECT column_name FROM information_schema.columns WHERE table_name = 'acc_nomenklatura';"
$q | Out-File "check_cols.sql" -Encoding UTF8
.\supabase.exe db query -f "check_cols.sql" --db-url $dbUrl
