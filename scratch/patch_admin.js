const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');
appJs = appJs.replace(
    'let planIdString = String(row.plan_id);\n        if (!mergedNodes[mergedId].planDbIds.includes(planIdString)) {\n            mergedNodes[mergedId].planDbIds.push(planIdString);\n        }',
    'let planIdString = String(row.plan_id);\n        if (!mergedNodes[mergedId].planDbIds.includes(planIdString)) {\n            mergedNodes[mergedId].planDbIds.push(planIdString);\n        }\n        if (pMonthStr && !mergedNodes[mergedId].planDbIds.includes(pMonthStr)) {\n            mergedNodes[mergedId].planDbIds.push(pMonthStr);\n        }'
);
fs.writeFileSync('app.js', appJs);

let tasksJs = fs.readFileSync('terminal/terminal-tasks.js', 'utf8');
tasksJs = tasksJs.replace(
    'physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r[\'Количество\']) || 0);',
    'physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r[\'Общо\']) || 0);'
);
fs.writeFileSync('terminal/terminal-tasks.js', tasksJs);

console.log('Fixed files');
