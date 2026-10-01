from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,tarfile,urllib.request
source,stage=map(Path,sys.argv[1:3])
inputs=json.loads((Path(__file__).parent/'oct01-release-inputs.json').read_text())
sha=lambda raw:hashlib.sha256(raw).hexdigest()
stage.mkdir(parents=True,exist_ok=False)
shutil.copytree(source/'dist/assets',stage/'assets')
html=(source/'dist/index.html').read_text()
entry=re.search(r'<script type="module" crossorigin src="([^"]+)"',html)[1]
gate=inputs['gate']
gate,count=re.subn(r"const entry='[^']+';",'const entry='+repr(entry)+';',gate)
assert count==1
gate_path='assets/radar-access-gate-oct01-'+sha(gate.encode())[:16]+'.js'
(stage/gate_path).write_text(gate)
html=html.replace('src="'+entry+'"','src="/'+gate_path+'"')
html=re.sub(r'team-access-v2.css\?v=\d+', 'team-access-v2.css?v=oct01-'+sha((stage/'assets/team-access-v2.css').read_bytes())[:12],html)
team_link=re.search(r'<link[^>]+team-access-v2\.css[^>]+>',html)[0]
html=html.replace(team_link,'')
html=html.replace('</head>','<link rel="stylesheet" href="/assets/login-premium-20260925.css?v=4">\n'+team_link+'\n</head>')
(stage/'radar-app.html').write_text(html)
with urllib.request.urlopen('https://radargt.wowlatam.com'+inputs['fiscal_asset'],timeout=30) as response: original=response.read()
assert sha(original)==inputs['fiscal_sha256'],'Fiscal build changed; review before patching'
code=original.decode()
replacements=[
 ('function _t({elections:e,folios:t,onSaveDraft:n,onSubmit:r})','function _t({assignmentId:radarAssignmentId,elections:e,folios:t,onSaveDraft:n,onSubmit:r})'),
 ('k=`rtd-${i}-${o?.catalogVersion??`pendiente`}`','k=`rtd-${radarAssignmentId}-${i}-${o?.catalogVersion??`pendiente`}`'),
 ('nullVotes:String(s.nullVotes||``)','nullVotes:String(s.nullVotes??``)'),
 ('blankVotes:String(s.blankVotes||``)','blankVotes:String(s.blankVotes??``)'),
 ('(_t,{elections:e.elections,folios:i,onSaveDraft:ee,onSubmit:T})','(_t,{assignmentId:e.assignment.id,elections:e.elections,folios:i,onSaveDraft:ee,onSubmit:T})')]
for old,new in replacements:
 assert code.count(old)==1,'Fiscal patch shape changed'
 code=code.replace(old,new)
fiscal_path='fiscales/assets/index-oct01-'+sha(code.encode())[:16]+'.js'
(stage/fiscal_path).parent.mkdir(parents=True,exist_ok=True)
(stage/fiscal_path).write_text(code)
fiscal_html=inputs['fiscal_html']
assert fiscal_html.count(inputs['fiscal_asset'])==1
(stage/'fiscales/index.html').write_text(fiscal_html.replace(inputs['fiscal_asset'],'/'+fiscal_path))
for file in stage.rglob('*.js'):
 assert file.stat().st_size<=740000
 subprocess.run(['node','--check',str(file)],check=True)
files={str(p.relative_to(stage)):sha(p.read_bytes()) for p in stage.rglob('*') if p.is_file()}
release={'source_sha':inputs['source_sha'],'date':'2026-10-01','scope':'October municipal usability and isolated RTD trials','environment':{'supabase_project':'xxobbhnhxhcjkdxmjmwj','fiscal_portal_url':'https://radargt.wowlatam.com/fiscales'},'quality':{'tests':153,'municipalities_validated':340,'quality_workflow':inputs['quality_run']},'files':files}
(stage/'radar-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
files['radar-release.json']=sha((stage/'radar-release.json').read_bytes())
plan={'expected':inputs['expected'],'files':files,'source_sha':inputs['source_sha'],'portal_url':'https://radargt.wowlatam.com/fiscales'}
(stage/'release-plan.json').write_text(json.dumps(plan,indent=2))
with tarfile.open('radar-oct01-release.tgz','w:gz') as archive:
 for name in [*files,'release-plan.json']:archive.add(stage/name,arcname=name)
print('OCT01_PACKAGE_VERIFIED',len(files),'files')
