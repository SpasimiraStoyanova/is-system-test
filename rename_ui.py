import os
import re

files_to_check = []
for root, _, files in os.walk('d:\\Projects\\IS_SYSTEM_TEST'):
    if 'node_modules' in root or '.git' in root: continue
    for f in files:
        if f.endswith(('.html', '.js', '.css', '.ps1', '.sql')):
            files_to_check.append(os.path.join(root, f))

for filepath in files_to_check:
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            content = file.read()
            
        new_content = content
        
        # We will replace '% Брак' only in labels, headers, and UI messages.
        # Let's see all occurrences of % Брак first.
        matches = re.finditer(r'.{0,30}%\s*[Бб][Рр][Аа][Кк].{0,30}', content)
        for m in matches:
            print(f"{os.path.basename(filepath)}: {m.group(0)}")
            
    except Exception as e:
        pass
