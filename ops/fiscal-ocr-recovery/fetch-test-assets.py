from pathlib import Path
import urllib.request,concurrent.futures
p=Path(__file__).parent/'test-assets'
paths=['assets/index-DACKz-qw.js','ocr/worker-v7.min.js','ocr/core/tesseract-core-lstm.wasm.js','ocr/core/tesseract-core-lstm.wasm','ocr/lang/spa.traineddata.gz']
def fetch(name):
 target=p/name;target.parent.mkdir(parents=True,exist_ok=True)
 with urllib.request.urlopen('https://radargt.wowlatam.com/fiscales/'+name,timeout=40) as r:target.write_bytes(r.read())
 print('TEST_ASSET_READY',name,target.stat().st_size)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,paths))
