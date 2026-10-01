"""Extract official aggregate tables; reject non-reconciling rows and duplicate keys."""
import json,re,sys,unicodedata
from pathlib import Path
normalize=lambda s: ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn').strip()
lines=Path(sys.argv[1]).read_text().splitlines()
municipalities=json.loads(Path(sys.argv[2]).read_text())
lookup={(normalize(m['department_name']),normalize(m['municipality_name'])):m['municipality_code'] for m in municipalities}
aliases={'Cahabón':'1612','Lanquín':'1611','Tucurú':'1606','El Chol':'1506','Comalapa':'0404','Pochuta':'0408','Yepocapa':'0412','1Iztapa':'0510','Petapa':'0117','San Raimundo':'0111','Barillas':'1326','Ixtahuacán':'1309','Soloma':'1308','Colomba':'0917','Olintepeque':'0903','Ostuncalco':'0909','Chichicastenango':'1406','Ixcán':'1420','Nebaj':'1413','Uspantán':'1415','Alotenango':'0314','El Rodeo':'1214','San Bartolo':'0808'}
rows={}; sex=department=name=None
for index,line in enumerate(lines):
    if line.startswith('Mujeres alfabetas Mujeres analfabetas'):sex='women'
    if line.startswith('Hombres alfabetas Hombres analfabetas'):sex='men'
    match=re.search(r'(?:Departamento|departamento) de (.+)',line)
    if match and sex:department=match[1].strip()
    match=re.match(r'(.+?) (?:Urbano|Rural) ',line)
    if match:
        name=match[1]; previous=lines[index-1].strip()
        if re.fullmatch(r'[A-Za-zÁÉÍÓÚáéíóúÑñüÜ .()-]+',previous) and not any(word in previous.lower() for word in ['departamento','alfabeta','edades','municipio','electoral']):name=previous+' '+name
    if not line.startswith('Total municipio ') or not all([sex,department,name]):continue
    values=[int(v.replace(',','')) for v in re.findall(r'\d[\d,]*',line)]
    assert len(values)>=13 and sum(values[:5])==values[5] and sum(values[6:11])==values[11],(index,line)
    code=lookup.get((normalize(department),normalize(name))) or aliases.get(name)
    assert code,(department,name)
    assert any(m['municipality_code']==code and normalize(m['department_name'])==normalize(department) for m in municipalities)
    row=rows.setdefault(code,{})
    assert sex not in row,(code,sex)
    row[sex]=values[5]+values[11]
assert len(rows)==338,len(rows)
assert all(len(row)==2 for row in rows.values())
assert sum(sum(row.values()) for row in rows.values())==7556873
Path(sys.argv[3]).write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print('PADRON_2015_OK: 338 municipalities; 676 sex totals; 7,556,873 national total')
