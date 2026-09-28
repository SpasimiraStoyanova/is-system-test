import urllib.request
import json

URL = 'https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/'
HEADERS = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
}

def check_table(table, params=""):
    req = urllib.request.Request(f"{URL}{table}?select=*{params}", headers=HEADERS)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

print("Nomenclature:")
for item in check_table("Номенклатура", "&ID%20Детайл=ilike.*575-01921%23*"):
    print(item.get('ID Детайл'), item.get('Тип'))
