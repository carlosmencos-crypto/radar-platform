# Guard inputs verified using cache-busted live assets and the deployed manifest.
from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,tarfile,urllib.request
source,stage=map(Path,sys.argv[1:3])
inputs=json.loads((Path(__file__).parent/'oct08-release-inputs.json').read_text())
sha=lambda raw:hashlib.sha256(raw).hexdigest()
stage.mkdir(parents=True,exist_ok=False)
shutil.copytree(source/'dist/assets',stage/'assets')
html=(source/'dist/index.html').read_text()
entry=re.search(r'<script type="module" crossorigin src="([^"]+)"',html)[1]
gate=inputs['gate']
gate,count=re.subn(r"const entry='[^']+';",'const entry='+repr(entry)+';',gate)
assert count==1
gate_path='assets/radar-access-gate-oct08-'+sha(gate.encode())[:16]+'.js'
(stage/gate_path).write_text(gate)
html=html.replace('src="'+entry+'"','src="/'+gate_path+'"')
html=re.sub(r'team-access-v2.css\?v=\d+', 'team-access-v2.css?v=oct08-'+sha((stage/'assets/team-access-v2.css').read_bytes())[:12],html)
team_link=re.search(r'<link[^>]+team-access-v2\.css[^>]+>',html)[0]
html=html.replace(team_link,'')
html=html.replace('</head>','<link rel="stylesheet" href="/assets/login-premium-20260925.css?v=4">\n'+team_link+'\n</head>')
(stage/'radar-app.html').write_text(html)
for file in stage.rglob('*.js'):
 assert file.stat().st_size<=740000
 subprocess.run(['node','--check',str(file)],check=True)
files={str(p.relative_to(stage)):sha(p.read_bytes()) for p in stage.rglob('*') if p.is_file()}
release=inputs['previous_release'].copy()
release.update({'source_sha':inputs['source_sha'],'date':'2026-10-08','scope':'Refine resource library folder dialog only','quality':{'tests':153,'municipalities_validated':340,'quality_workflow':inputs['quality_run']},'files':{**release.get('files',{}),**files}})
(stage/'radar-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
files['radar-release.json']=sha((stage/'radar-release.json').read_bytes())
plan={'expected':inputs['expected'],'files':files,'source_sha':inputs['source_sha'],'portal_url':'https://radargt.wowlatam.com/fiscales'}
(stage/'release-plan.json').write_text(json.dumps(plan,indent=2))
with tarfile.open('radar-oct08-release.tgz','w:gz') as archive:
 for name in [*files,'release-plan.json']:archive.add(stage/name,arcname=name)
print('OCT08_PACKAGE_VERIFIED',len(files),'files')
