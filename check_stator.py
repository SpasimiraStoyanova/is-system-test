import urllib.request
import json

url = "https://zdythzcgcjxwbxufunuh.supabase.co/rest/v1/marshruti?select=Код%20на%20детайла&Код%20на%20детайла=ilike.*СТАТОР*&limit=1000"
req = urllib.request.Request(url)
req.add_header('apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE')
req.add_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE')

try:
    response = urllib.request.urlopen(req)
    data = json.loads(response.read().decode('utf-8'))
    unique = list(set([d['Код на детайла'] for d in data]))
    print(unique)
except Exception as e:
    print(e)
