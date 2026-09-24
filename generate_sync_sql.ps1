$csvContent = Get-Content -Path 'descriptions.csv'
$sqlContent = ""

$first = $true
foreach ($line in $csvContent) {
    if ($first) { $first = $false; continue; }
    if ([string]::IsNullOrWhiteSpace($line)) { continue; }
    
    $lastCommaIndex = $line.LastIndexOf(',')
    if ($lastCommaIndex -eq -1) { continue; }
    
    $itemNum = $line.Substring($lastCommaIndex + 1).Trim()
    $description = $line.Substring(0, $lastCommaIndex).Trim()
    
    if ($description.StartsWith('"') -and $description.EndsWith('"')) {
        $description = $description.Substring(1, $description.Length - 2)
        $description = $description.Replace('""', '"')
    }
    
    # Escape single quotes for SQL
    $sqlDesc = $description.Replace("'", "''")
    $sqlItemNum = $itemNum.Replace("'", "''")
    
    if ($itemNum -and $description) {
        $sqlContent += "UPDATE ""Номенклатура"" SET ""Описание"" = '$sqlDesc' WHERE ""ID Детайл"" = '$sqlItemNum' OR ""Вътрешно име"" = '$sqlItemNum';`n"
    }
}

Set-Content -Path 'sync_desc.sql' -Value $sqlContent -Encoding UTF8
Write-Host "Generated sync_desc.sql with $(($sqlContent.Split("`n")).Count) statements."
