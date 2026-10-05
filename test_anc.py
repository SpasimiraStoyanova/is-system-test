import json
import re

with open('check_bom.json', 'r', encoding='utf-16le') as f:
    bom = json.load(f)

target = "статорвар25r3"
ancestors = {target}

def normalize(s):
    if not s: return ''
    return re.sub(r'[^a-zа-я0-9]', '', str(s).lower())

added = True
while added:
    added = False
    for b in bom:
        child_raw = list(b.values())[1]
        parent_raw = list(b.values())[0]
        child = normalize(child_raw)
        parent = normalize(parent_raw)
        
        if child in ancestors and parent not in ancestors:
            ancestors.add(parent)
            added = True

print("Ancestors found:")
for a in ancestors:
    print(a)
