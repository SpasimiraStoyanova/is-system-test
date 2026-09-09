$oldUrl = "aoekbmhgbohsgpwqsizv"
$newUrl = "zdythzcgcjxwbxufunuh"

$oldKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU"
$newKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE"

$files = Get-ChildItem -Path "d:\Projects\IS_SYSTEM_TEST" -Recurse -Include *.js, *.html

foreach ($file in $files) {
    if ($file.FullName -match "\\node_modules\\" -or $file.FullName -match "\\.git\\") {
        continue
    }

    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -match $oldUrl -or $content -match [regex]::Escape($oldKey)) {
        $content = $content -replace $oldUrl, $newUrl
        $content = $content -replace [regex]::Escape($oldKey), $newKey
        
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8
        Write-Host "Updated: $($file.FullName)"
    }
}
Write-Host "Done swapping test env keys!"
