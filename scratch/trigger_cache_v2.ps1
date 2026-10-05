$envContent = Get-Content ".env"
$dbUrl = ""
foreach ($line in $envContent) {
    if ($line -match '^DATABASE_URL="(.*)"$') {
        $dbUrl = $matches[1]
    }
}
"ALTER TABLE public.acc_nomenklatura ADD COLUMN dummy text;" | Out-File "t1.sql" -Encoding UTF8
.\supabase.exe db query -f "t1.sql" --db-url $dbUrl
"ALTER TABLE public.acc_nomenklatura DROP COLUMN dummy;" | Out-File "t2.sql" -Encoding UTF8
.\supabase.exe db query -f "t2.sql" --db-url $dbUrl
"NOTIFY pgrst, 'reload schema';" | Out-File "t3.sql" -Encoding UTF8
.\supabase.exe db query -f "t3.sql" --db-url $dbUrl
