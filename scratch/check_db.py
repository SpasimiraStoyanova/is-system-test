import urllib.request
import json
import ssl

url = 'https://aoekbmhgbohsgpwqsizv.supabase.co/rest/v1/otcheti?ID%20%D0%94%D0%B5%D1%82%D0%B0%D0%B9%D0%BB=eq.%D0%92%D0%B0%D0%BB%20%D0%92%D0%B0%D1%80.%2011%20%23&select=*'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU'
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as response:
        data = json.loads(response.read().decode())
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(e)

