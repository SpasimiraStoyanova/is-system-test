import requests
url = 'https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
}
res = requests.post(
    'https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/rpc/get_trigger_def',
    headers=headers,
    json={"table_name": "otcheti"}
)
print(res.status_code, res.text)
