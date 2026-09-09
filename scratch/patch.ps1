$appJs = Get-Content 'app.js' -Raw
$appJs = $appJs.Replace('let planIdString = String(row.plan_id);
        if (!mergedNodes[mergedId].planDbIds.includes(planIdString)) {
            mergedNodes[mergedId].planDbIds.push(planIdString);
        }', 'let planIdString = String(row.plan_id);
        if (!mergedNodes[mergedId].planDbIds.includes(planIdString)) {
            mergedNodes[mergedId].planDbIds.push(planIdString);
        }
        if (pMonthStr && !mergedNodes[mergedId].planDbIds.includes(pMonthStr)) {
            mergedNodes[mergedId].planDbIds.push(pMonthStr);
        }')
Set-Content 'app.js' -Value $appJs

$tasksJs = Get-Content 'terminal/terminal-tasks.js' -Raw
$tasksJs = $tasksJs.Replace('physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r[''Количество'']) || 0);', 'physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r[''Общо'']) || 0);')
Set-Content 'terminal/terminal-tasks.js' -Value $tasksJs

Write-Host "Done patching"
