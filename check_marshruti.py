import urllib.request
import json
import os

url = 'https://eud2tsynfbevfg33iluabjqwcpbt6jfj3avuwtnw2fsr2wqo7xmwvs2lqwfozkjqiukzqfdnzjzmpg4jhyfryyukbknemdrw4a3fqfa.supabase.co/rest/v1/marshruti?select=*&Код%20на%20детайла=eq.тефлонова%20макара'
req = urllib.request.Request(url)
req.add_header('apikey', 'os_v2_app_eud2tsynfbevfg33iluabjqwcpbt6jfj3avuwtnw2fsr2wqo7xmwvs2lqwfozkjqiukzqfdnzjzmpg4jhyfryyukbknemdrw4a3fqfa')
req.add_header('Authorization', 'Bearer os_v2_app_eud2tsynfbevfg33iluabjqwcpbt6jfj3avuwtnw2fsr2wqo7xmwvs2lqwfozkjqiukzqfdnzjzmpg4jhyfryyukbknemdrw4a3fqfa')

try:
    response = urllib.request.urlopen(req)
    data = json.loads(response.read())
    for item in data:
        print(f"Оп: {item['№ Операция']} - {item['Име на операция']}")
except Exception as e:
    print(e)
