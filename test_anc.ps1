$nom = (Get-Content D:\Projects\IS_SYSTEM_TEST\nom_dump.json -Raw | ConvertFrom-Json)
$bom = (Get-Content D:\Projects\IS_SYSTEM_TEST\check_bom.json -Raw | ConvertFrom-Json)
$target = "статорвар25r3"

$ancestors = New-Object System.Collections.Generic.HashSet[string]
$ancestors.Add($target) | Out-Null

$added = $true
while ($added) {
    $added = $false
    foreach ($b in $bom) {
        $childRaw = $b.psobject.properties.value[1]
        $parentRaw = $b.psobject.properties.value[0]
        if ([string]::IsNullOrEmpty($childRaw) -or [string]::IsNullOrEmpty($parentRaw)) { continue }
        
        $child = ($childRaw -replace '[^a-zA-Zа-яА-Я0-9]', '').ToLower()
        $parent = ($parentRaw -replace '[^a-zA-Zа-яА-Я0-9]', '').ToLower()
        
        if ($ancestors.Contains($child) -and -not $ancestors.Contains($parent)) {
            $ancestors.Add($parent) | Out-Null
            $added = $true
        }
    }
}
Write-Host "Ancestors found:"
$ancestors | ForEach-Object { Write-Host $_ }
