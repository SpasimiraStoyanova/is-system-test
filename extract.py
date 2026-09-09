import subprocess

with open('old_migration_fixed.sql', 'wb') as f:
    result = subprocess.run(['git', 'show', '0df41b5:database_migration.sql'], stdout=f)
