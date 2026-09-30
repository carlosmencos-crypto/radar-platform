#!/usr/bin/env python3
"""Prepare a scoped fiscal portal release on the existing RADAR origin."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,tarfile

main_root,fiscal_root,stage=map(Path,sys.argv[1:4])
prefix="/fiscales"
old_url="https://fiscales.wowlatam.com"
new_url="https://radargt.wowlatam.com/fiscales"
source_sha="fb82c56aa96118f5a4726987fd505a4a1b84da3f"
fiscal_sha="9b6f24e8226e1d84d05a977a39b36871f8687e98"
sha=lambda raw:hashlib.sha256(raw).hexdigest()
stage.mkdir(parents=True,exist_ok=False)

release=json.loads((main_root/"radar-release.json").read_text())
assert release["source_sha"]==source_sha,"Unexpected main source"
expected={name:sha((main_root/name).read_bytes()) for name in ("radar-app.html","radar-release.json")}
main_name="assets/index-BEaqfzxg.js"
original=(main_root/main_name).read_text()
assert original.count(old_url)==2,"Unexpected fiscal URL occurrences"
main_text=original.replace(old_url,new_url)
new_main_name="assets/index-fiscal-"+sha(main_text.encode())[:16]+".js"
(stage/new_main_name).parent.mkdir(parents=True)
(stage/new_main_name).write_text(main_text)

old_gate="assets/radar-access-gate-c4cb14b0dbca.js"
gate=(main_root/old_gate).read_text()
assert gate.count("/"+main_name)==1,"Unexpected access gate entry"
gate=gate.replace("/"+main_name,"/"+new_main_name)
new_gate="assets/radar-access-gate-fiscal-"+sha(gate.encode())[:16]+".js"
(stage/new_gate).write_text(gate)
html=(main_root/"radar-app.html").read_text()
assert html.count("/"+old_gate)==1,"Unexpected HTML access gate"
html=html.replace("/"+old_gate,"/"+new_gate)
(stage/"radar-app.html").write_text(html)

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
(portal/"sw.js").write_text("""const SHELL="radar-fiscal-path-shell-v1";
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
for row in release["files"]:
    if row["path"]==main_name:row["path"]=new_main_name
    if row["path"]==old_gate:row["path"]=new_gate
    staged=stage/row["path"]
    if staged.is_file():
        row["size"]=staged.stat().st_size
        row["sha256"]=sha(staged.read_bytes())
release["environment"]["fiscal_portal_url"]=new_url
release["scope"]+="; fiscal production path /fiscales while the dedicated subdomain awaits provisioning"
release["fiscal_source_sha"]=fiscal_sha
release["fiscal_release_manifest"]="fiscales/fiscal-release.json"
(stage/"radar-release.json").write_text(json.dumps(release,ensure_ascii=False,indent=2)+"\n")

files={str(p.relative_to(stage)):sha(p.read_bytes()) for p in sorted(stage.rglob("*")) if p.is_file()}
plan={"expected":expected,"files":files,"portal_url":new_url+"/","source_sha":source_sha,"fiscal_sha":fiscal_sha}
(stage/"release-plan.json").write_text(json.dumps(plan))
archive=stage.parent/"radar-fiscal-path-release.tgz"
with tarfile.open(archive,"w:gz") as package:
    for name in list(files)+["release-plan.json"]:
        package.add(stage/name,arcname=name)
print(json.dumps({"release_prepared":True,"files":len(files),"archive_bytes":archive.stat().st_size,"portal_url":new_url+"/","main_entry":new_main_name}))
