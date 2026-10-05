const fs = require('fs');
try {
    new Function(fs.readFileSync('D:/Projects/IS_SYSTEM_TEST/traceability.js', 'utf8'));
    console.log("Syntax OK");
} catch(e) {
    console.log("Syntax Error:", e.message);
}
