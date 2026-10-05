$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}
.\supabase.exe db query -f "reload.sql" --db-url $dbUrl
