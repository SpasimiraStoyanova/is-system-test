const fs = require('fs');

let terminalJS = fs.readFileSync('terminal/terminal-tasks.js', 'utf8');

let startLoadTasks = terminalJS.indexOf('async function loadTasks(isSilent = false) {');
let endLoadTasks = terminalJS.indexOf('function renderTasks(tasks) {');
let logicToExtract = terminalJS.substring(startLoadTasks, endLoadTasks);

fs.writeFileSync('scratch/extracted_raw.js', logicToExtract);
