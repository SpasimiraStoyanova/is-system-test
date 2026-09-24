import io

with io.open('terminal/terminal-tasks.js', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('async function loadTasks(isSilent = false) {')
end = content.find('function renderTasks(tasks) {')

logic = content[start:end]

with io.open('scratch/extracted_raw.js', 'w', encoding='utf-8') as f:
    f.write(logic)
