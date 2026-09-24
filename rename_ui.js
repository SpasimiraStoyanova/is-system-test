const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory && !dirPath.includes('node_modules') && !dirPath.includes('.git')) {
            walkDir(dirPath, callback);
        } else if (!isDirectory) {
            callback(path.join(dir, f));
        }
    });
}

walkDir('d:\\Projects\\IS_SYSTEM_TEST', function(filePath) {
    if (filePath.match(/\.(html|js|css|ps1|sql)$/)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        let matches = content.match(/.{0,30}%\s*[Бб][Рр][Аа][Кк].{0,30}/g);
        if (matches) {
            matches.forEach(m => console.log(`${path.basename(filePath)}: ${m}`));
        }
        let matches2 = content.match(/.{0,30}Процент Брак.{0,30}/gi);
        if (matches2) {
            matches2.forEach(m => console.log(`${path.basename(filePath)}: ${m}`));
        }
    }
});
