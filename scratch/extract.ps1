$content = [IO.File]::ReadAllText('terminal/terminal-tasks.js', [System.Text.Encoding]::UTF8)
$start = $content.IndexOf('async function loadTasks(isSilent = false) {')
$end = $content.IndexOf('function renderTasks(tasks) {')
$len = $end - $start
$logic = $content.Substring($start, $len)

# Rename to generateTerminalTasks
$logic = $logic.Replace('async function loadTasks(isSilent = false) {', 'async function generateTerminalTasks(client) {')

# Remove UI specific stuff
$logic = $logic -replace 'isUserCheckedIn = await fetchUserCheckInStatus\(\);', ''
$logic = $logic -replace 'document\.getElementById\(''bigLoginScreen''\).*?return;', ''
$logic = $logic -replace 'document\.getElementById.*?;\s*', ''
$logic = $logic -replace 'var container = document\.getElementById.*?;\s*', ''
$logic = $logic -replace 'if \(\!isSilent\) container\.innerHTML.*?;\s*', ''

# Remove currentOperator and currentMachine usage
$logic = $logic.Replace('currentOperator', '""')
$logic = $logic.Replace('currentMachine', '""')

# Replace globalTasks with a local var
$logic = $logic.Replace('globalTasks = [];', 'let generatedTasks = [];')
$logic = $logic.Replace('globalTasks.push', 'generatedTasks.push')

# Before catch block, return generatedTasks
$logic = $logic.Replace('renderTasks(globalTasks);', 'return generatedTasks;')

# Rename global variables
$logic = $logic.Replace('globalNomData =', 'let globalNomData =')
$logic = $logic.Replace('globalBomData =', 'let globalBomData =')
$logic = $logic.Replace('globalRoutesByDetail =', 'let globalRoutesByDetail =')

[IO.File]::WriteAllText('scratch/extracted_raw.js', $logic, [System.Text.Encoding]::UTF8)
