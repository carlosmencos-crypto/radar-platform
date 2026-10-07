import re,json,unicodedata
from pathlib import Path
norm=lambda s:re.sub('[^a-z]','', ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn'))
import sys
ms=json.loads(Path(sys.argv[1]).read_text());lines=Path(sys.argv[2]).read_text().splitlines();blocks=[];cur=None;start=0
for i,l in enumerate(lines):
 if l.strip() in ('Mujeres','Hombres'):
  sex=l.strip()
  if not cur or sex!=cur['sex']:
   cur={'sex':sex,'head':' / '.join(x.strip() for x in lines[max(0,i-5):i] if x.strip()),'rows':[]};blocks.append(cur);start=i
 if cur and re.match(r'^\s*Total\s+[\d,]+',l):
  vals=[int(x.replace(',','')) for x in re.findall(r'\d[\d,]*',l)];cur['rows'].append({'values':vals,'context':'\n'.join(lines[start:i]),'line':i});start=i+1
aliases={'Petapa':'Petapa','San Bartolo Aguas Calientes':'San Bartolo','San Pedro Yepocapa':'Yepocapa','San Juan Comalapa':'Comalapa','Santa María Visitación':'Santa Maria Visitacion','San Antonio Palopó':'San Antonio Palopo','Santa Bárbara':'Santa Barbara','Colomba Costa Cuca':'Colomba','San Juan Ostuncalco':'Ostuncalco','Santa Cruz Barillas':'Barillas','San Pedro Soloma':'Soloma','San Ildefonso Ixtahuacán':'Ixtahuacan','San Andrés Sajcabajá':'San Andres Sajcabaja','Santa María Nebaj':'Nebaj','San Miguel Uspantán':'Uspantan','Santo Tomás Chichicastenango':'Chichicastenango','Santa Catalina La Tinta':'La Tinta','San Miguel Tucurú':'Tucuru','San Agustín Lanquín':'Lanquin','Santa María Cahabón':'Cahabon','Santa Cruz El Chol':'El Chol','San Sebastián Retalhuleu':'San Sebastian','San Miguel Dueñas':'San Miguel Duenas','San Juan Alotenango':'Alotenango','San José / Puerto San José':'San Jose','San José Poaquil':'San Jose Poaquil'}
aliases.update({'San Raymundo':'San Raimundo','San Miguel Petapa':'Petapa','San Miguel Pochuta':'Pochuta','San Juan Olintepeque':'Olintepeque','San José el Rodeo':'El Rodeo','Playa Grande Ixcán':'Ixcán'})
rows=[];bad=[]
for b in blocks[:44]:
 dept=b['head'].split('Departamento de ')[1].split(' /')[0];mun=sorted([m for m in ms if norm(m['department_name'])==norm(dept)],key=lambda m:m['municipality_code'])
 for m,r in zip(mun,b['rows']):
  ctx=r['context'].replace('URBANO','').replace('RURAL','');name=aliases.get(m['municipality_name'],m['municipality_name']);
  if norm(name) not in norm(ctx):bad.append((m['municipality_code'],name,b['sex'],ctx[:300]))
  rows.append(dict(code=m['municipality_code'],sex=b['sex'],**r))
assert len(rows)==680 and not bad, bad
for r in rows:
 v=r['values']; assert len(v)==13 and sum(v[:5])==v[5] and sum(v[6:11])==v[11] and v[5]+v[11]==v[12],r['code']
valid={}
for r in rows:
 if not r['code'].startswith('03'): valid[r['code']]=valid.get(r['code'],0)+r['values'][-1]
assert len(valid)==324 and valid['0509']==31810
print(json.dumps(valid,sort_keys=True,indent=2))
