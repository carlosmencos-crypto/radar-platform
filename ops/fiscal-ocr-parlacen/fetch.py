from pathlib import Path
import urllib.request,re
p=Path('ops/fiscal-ocr-parlacen')
def get(path):
 with urllib.request.urlopen('https://radargt.wowlatam.com'+path,timeout=30) as r:return r.read()
h=get('/fiscales/?ocr-parlacen').decode();entry=re.search(r'src="(/fiscales/assets/index-[^"]+\.js)"',h).group(1);s=get(entry);(p/'entry.js').write_bytes(s)
for name in set(re.findall(r'\./(src-ocr-isolated-[^`"\s]+\.js)',s.decode())):
 c=get('/fiscales/assets/'+name);(p/name).write_bytes(c)
 for helper in set(re.findall(r'\./(ocr-helpers-[^"\s]+\.js)',c.decode())):(p/helper).write_bytes(get('/fiscales/assets/'+helper))
print('LIVE_OCR_FETCHED',entry)
