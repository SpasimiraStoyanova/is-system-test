import re
import os

filepath = r'D:\Projects\IS_SYSTEM_TEST\admin\admin-core.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace tab checks
content = content.replace("tabKey !== 'sklad_gp' && tabKey !== 'sklad_wip'", "tabKey !== 'sklad_inventory'")
content = content.replace("currentTab === 'sklad_gp' || currentTab === 'sklad_wip'", "currentTab === 'sklad_inventory'")
content = content.replace("currentTab === 'sklad_gp'", "currentTab === 'sklad_inventory'") # For cases where it was doing if.. else if
content = content.replace("currentTab === 'sklad_wip'", "false") # Since we merged them

# Fix computeSkladData
content = re.sub(r'async function computeSkladData\(isGpTab\) \{[\s\S]*?const table = [^;]+;', 
                 r"async function computeSkladData() {\n    const table = 'inventory';", content)

# Fix loading logic
content = re.sub(r"\} else if \(currentTab === 'sklad_inventory'\) \{\s*rows = await computeSkladData\(true\);\s*\} else if \(false\) \{\s*rows = await computeSkladData\(false\);\s*\}", 
                 r"} else if (currentTab === 'sklad_inventory') {\n          rows = await computeSkladData();\n      }", content)

# Replace remaining computeSkladData(true) or (false) with computeSkladData()
content = content.replace("computeSkladData(true)", "computeSkladData()")
content = content.replace("computeSkladData(false)", "computeSkladData()")

# Fix upsert logic (line ~610-642)
# Since we now have one table 'inventory', we just use it.
content = re.sub(r"let tName = [^;]+;\s*if \([^)]+\) \{\s*if \(currentTab === 'sklad_inventory'\) opName = 'готов детайл';\s*\}\s*else \{\s*if \(currentTab === 'sklad_inventory'\) \{\s*tName = 'inventory_gp';\s*\} else if \(false\) \{\s*tName = 'inventory_wip';\s*\}\s*\}", 
                 r"let tName = 'inventory';\n                  // removed complex op mapping", content)

content = re.sub(r"if \(tName === 'inventory_wip'\) query = query\.eq\('Операция', opName\);",
                 r"query = query.eq('Операция', opName);", content)

content = re.sub(r"if \(tName === 'inventory_wip'\) payload\[\"Операция\"\] = opName;",
                 r"payload[\"Операция\"] = opName;", content)

content = re.sub(r"let \{ error: upsertErr \} = await client\.from\(tName\)\.upsert\(\[payload\], \{ onConflict: [^}]+ \}\);",
                 r"let { error: upsertErr } = await client.from(tName).upsert([payload], { onConflict: 'ID Детайл, Операция' });", content)

content = re.sub(r"if \(tName === 'inventory_wip'\) auditNewData\[\"Операция\"\] = opName;",
                 r"auditNewData[\"Операция\"] = opName;", content)

# Replace computed_sklad_gp with inventory
content = content.replace("'computed_sklad_gp'", "'inventory'")
content = content.replace("'computed_sklad_wip'", "'inventory'")
content = content.replace("config.table === 'computed_sklad_gp'", "config.table === 'inventory'")

# Write back
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("admin-core.js patched.")
