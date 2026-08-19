import urllib.request, re
req = urllib.request.Request('https://www.enterprisedb.com/download-postgresql-binaries', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
match = re.search(r'href="(https://[^"]+postgresql-17[^"]+-windows-x64-binaries\.zip)"', html)
if match:
    print(match.group(1))
else:
    print('Not found')
