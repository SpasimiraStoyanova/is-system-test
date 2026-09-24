$ext = [IO.File]::ReadAllText('scratch/extracted_raw.js', [System.Text.Encoding]::UTF8)
$bob = [IO.File]::ReadAllText('planner-bobini.js', [System.Text.Encoding]::UTF8)
[IO.File]::WriteAllText('planner-bobini.js', $bob + [Environment]::NewLine + $ext, [System.Text.Encoding]::UTF8)
