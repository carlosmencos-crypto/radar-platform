from pathlib import Path
import hashlib,json,re,subprocess,tarfile,urllib.request,time
p=Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
base='https://radargt.wowlatam.com'
def get(path):
 req=urllib.request.Request(base+path,headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=30) as r:return r.read()
inputs=json.loads((p/'inputs.json').read_text())
original=get(inputs['entry'])
assert sha(original)==inputs['entry_sha'],'Fiscal source changed; stop'
(p/'live-entry.js').write_bytes(original)
subprocess.run(['python3',str(p/'patch.py'),str(p/'live-entry.js'),str(p/'fixed-entry.js')],check=True)
subprocess.run(['node','--check',str(p/'fixed-entry.js')],check=True)
html=get('/fiscales/index.html?ocr-recovery='+str(time.time_ns()))
manifest_raw=get('/radar-release.json?ocr-recovery='+str(time.time_ns()))
manifest=json.loads(manifest_raw)
assert html.decode().count(inputs['entry'])==1,'Fiscal index changed; stop'
entry='fiscales/assets/index-ocr-recovery-'+sha((p/'fixed-entry.js').read_bytes())[:16]+'.js'
newhtml=html.decode().replace(inputs['entry'],'/'+entry).encode()
files={entry:(p/'fixed-entry.js').read_bytes(),'fiscales/index.html':newhtml}
for name,data in files.items():manifest.setdefault('files',{})[name]=sha(data)
manifest['fiscal_ocr_recovery']={'date':'2026-10-08','previous_entry':inputs['entry'],'entry':'/'+entry,'changes':['durable photo before OCR','draft hydration guard','lower temporary memory'],'google_document_ai_enabled':False}
files['radar-release.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
expected={'fiscales/index.html':sha(html),'radar-release.json':sha(manifest_raw),inputs['entry'].lstrip('/'):inputs['entry_sha']}
stage=Path('release-stage');stage.mkdir(exist_ok=True)
for name,data in files.items():
 f=stage/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
plan={'expected':expected,'files':{name:sha(data) for name,data in files.items()},'source_sha':manifest.get('source_sha'),'portal_url':base+'/fiscales/'}
(stage/'release-plan.json').write_text(json.dumps(plan))
with tarfile.open('radar-oct08-release.tgz','w:gz') as tf:
 for name in [*files,'release-plan.json']:tf.add(stage/name,arcname=name)
print('FISCAL_RECOVERY_PACKAGE_OK',entry)
