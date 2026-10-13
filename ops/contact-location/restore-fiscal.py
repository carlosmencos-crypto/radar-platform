from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,tarfile,os
fiscal_root,stage=map(Path,sys.argv[1:3])
prefix="/fiscales"
new_url="https://radargt.wowlatam.com/fiscales"
fiscal_sha="9b6f24e8226e1d84d05a977a39b36871f8687e98"
sha=lambda raw:hashlib.sha256(raw).hexdigest()
portal=stage/"fiscales"
shutil.copytree(fiscal_root,portal,ignore=shutil.ignore_patterns(".git"))
static_pattern=re.compile(r"""(["'\x60])(/(?:assets/|brand/|icons/|ocr/|campaign-party-logo-[^"'\x60]+|sw\.js|favicon\.svg|fiscal-manifest\.webmanifest|radar-fiscal-config\.js))""")
for path in portal.rglob("*"):
    if path.is_file() and path.suffix in (".js",".css",".html"):
        text=path.read_text()
        text=static_pattern.sub(lambda m:m.group(1)+prefix+m.group(2),text)
        text=re.sub(r'url\((/(?:assets/|brand/|icons/|ocr/))',lambda m:"url("+prefix+m.group(1),text)
        path.write_text(text)
manifest_path=portal/"fiscal-manifest.webmanifest"
manifest=json.loads(manifest_path.read_text())
for key in ("id","scope","start_url"):
    manifest[key]=prefix+"/"
for icon in manifest["icons"]:
    icon["src"]=prefix+icon["src"]
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
(portal/"sw.js").write_text("""const SHELL="radar-fiscal-path-shell-v2";
const PREFIX="/fiscales/";
const STATIC=[PREFIX,PREFIX+"fiscal-manifest.webmanifest",PREFIX+"brand/radar-electoral-logo-horizontal-claro.svg",PREFIX+"icons/radar-app-icon-192x192.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(STATIC)).catch(()=>undefined));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("radar-fiscal-path-shell-")&&key!==SHELL).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener("fetch",event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin||!url.pathname.startsWith(PREFIX))return;
 if(request.mode==="navigate"){event.respondWith(fetch(request).catch(()=>caches.match(PREFIX)));return;}
 if(STATIC.includes(url.pathname)||url.pathname.startsWith(PREFIX+"icons/")||url.pathname.startsWith(PREFIX+"brand/")){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(SHELL).then(cache=>cache.put(request,copy));}return response;})));
 }
});
""")
htaccess=portal/".htaccess"
rules=htaccess.read_text()
no_store='''  <FilesMatch "^(index\\.html|radar-fiscal-config\\.js|sw\\.js)$">
    Header set Cache-Control "no-store, max-age=0"
  </FilesMatch>
'''
assert no_store in rules,"Unexpected fiscal cache rules"
rules=rules.replace(no_store,"")
last=rules.rfind("</IfModule>")
assert last>=0
rules=rules[:last]+no_store+rules[last:]
htaccess.write_text(rules)
fiscal_html=(portal/"index.html").read_text()
assert 'src="/fiscales/assets/index-DACKz-qw.js"' in fiscal_html
assert 'src="/fiscales/radar-fiscal-config.js"' in fiscal_html
fiscal_js=portal/"assets/index-DACKz-qw.js"
fiscal_code=fiscal_js.read_text()
assert "register("+chr(96)+"/fiscales/sw.js"+chr(96)+")" in fiscal_code
assert "/fiscales/ocr/worker-v7.min.js" in fiscal_code
assert "/fiscales/ocr/core/tesseract-core-lstm.wasm.js" in fiscal_code
assert "/fiscales/ocr/lang" in fiscal_code
assert "radar-supabase-session-v1" not in fiscal_code,"Fiscal session must remain independent"
assert "xxobbhnhxhcjkdxmjmwj.supabase.co/functions/v1/fiscal-api" in (portal/"radar-fiscal-config.js").read_text()
for path in stage.rglob("*.js"):
    with path.open("rb") as code:
        subprocess.run(["node","--input-type=module","--check"],stdin=code,check=True,capture_output=True)

fiscal_files=[{"path":str(p.relative_to(portal)),"size":p.stat().st_size,"sha256":sha(p.read_bytes())}
              for p in sorted(portal.rglob("*")) if p.is_file()]
(portal/"fiscal-release.json").write_text(json.dumps({
 "source_sha":fiscal_sha,
 "portal_url":new_url+"/",
 "api_origin":"https://radargt.wowlatam.com",
 "api_project":"xxobbhnhxhcjkdxmjmwj",
 "scope":"Fiscal production path on the existing RADAR Hostinger origin",
 "files":fiscal_files},ensure_ascii=False,indent=2)+"\n")

patches=Path(__file__).parent/'fiscal-assets'
for p in patches.glob('*.js'):
 shutil.copy2(p,portal/'assets'/p.name)
entry='index-ocr-recovery-1ed57183d3ded50e.js'
assert sha((portal/'assets'/entry).read_bytes())=='1ed57183d3ded50e8e3e33531f6379afb27c1385136a4b915661e94db4d7547c'
html=(portal/'index.html').read_text().replace('index-DACKz-qw.js',entry)
(portal/'index.html').write_text(html)
assert sha((portal/'index.html').read_bytes())=='782ad9db6d9de1177b12e595023dfa6d34b5554649284b18c5e6977fe4839c4f','Unexpected restored fiscal shell'
for p in patches.glob('*.js'):
 subprocess.run(['node','--check',str(portal/'assets'/p.name)],check=True)
release=json.loads((stage/'radar-release.json').read_text())
release.update(date='2026-10-13',scope='Restore approved fiscal portal and mobile DPI corner controls')
release['environment']['fiscal_portal_url']=new_url
fiscal_files={str(p.relative_to(stage)):sha(p.read_bytes()) for p in portal.rglob('*') if p.is_file()}
release['files'].update(fiscal_files)
release['fiscal_ocr_recovery']['entry']='/fiscales/assets/'+entry
(stage/'radar-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
plan=json.loads((stage/'release-plan.json').read_text())
plan['files']={str(p.relative_to(stage)):sha(p.read_bytes()) for p in stage.rglob('*') if p.is_file() and p.name!='release-plan.json'}
plan['missing']=['fiscales/index.html']
(stage/'release-plan.json').write_text(json.dumps(plan))
with tarfile.open('radar-oct08-release.tgz','w:gz') as package:
 for name in [*plan['files'],'release-plan.json']:package.add(stage/name,arcname=name)
print('COMBINED_RESTORATION_PACKAGE',len(plan['files']))

