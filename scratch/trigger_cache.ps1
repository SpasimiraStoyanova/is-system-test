$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}
$q = "ALTER TABLE public.acc_nomenklatura ADD COLUMN dummy text; ALTER TABLE public.acc_nomenklatura DROP COLUMN dummy;"
$q | Out-File "trigger.sql" -Encoding UTF8
.\supabase.exe db query -f "trigger.sql" --db-url $dbUrl
