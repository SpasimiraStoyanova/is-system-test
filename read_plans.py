import json

with open('check_plans.json', 'r', encoding='utf-16le') as f:
    data = json.load(f)

for row in data:
    for k, v in row.items():
        if v and isinstance(v, str) and '25' in v:
            print(row)
            break
