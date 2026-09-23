"""Reconcile official August 2023 CSV/JSON; produce the existing shared contract.

Only counted actas contribute votes. June layers and held coordinates are preserved.
Run from repository root. No network or database writes are performed by this script.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docs/qa/sources/trep-2023-repeat'
BASE = 'https://segundaeleccion.trep.gt/ext/jsonData_gtm2023/1692574389/1692594771/'
SNAPSHOT = '2023-08-20T23:12:00-06:00'
CODE = 'CORPORACION_MUNICIPAL'
LAYER = 'TREP_2023_CENTER_RESULTS_' + CODE


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mesas(ranges):
    result = set()
    for segment in ranges.split(';'):
        bounds = [int(x) for x in segment.strip().split('-')]
        result.update(range(bounds[0], bounds[-1] + 1))
    return result


def build(old):
    code = old['municipality_code']
    csv_path = SRC / f'gtm2023_e4d{code[:2]}m{code[2:]}.csv'
    json_path = SRC / f'gtm2023_tc4_e{int(code[:2])}.json'
    raw = csv_path.read_text(encoding='utf-8-sig')
    rows = list(csv.DictReader(raw[raw.index('MESA,'):].splitlines()))
    headers = list(rows[0])
    parties = headers[headers.index('PADRÓN')+1:headers.index('VÁLIDOS')]
    summary = dict(zip(raw.splitlines()[2].split(','), raw.splitlines()[3].split(',')))
    dept = json.loads(json_path.read_text())
    official = next(m for m in dept['divs'] if m['divNum'] == int(code[2:]))
    assert dept['divNum'] == int(code[:2])
    official_rows = {r['mesa']: (s['seccion'], r) for s in official['secciones'] for r in s['casillas']}
    assert len(rows) == len({r['MESA'] for r in rows}) == int(summary['ACTAS_ESPERADAS'])
    assert set(official_rows) == {int(r['MESA']) for r in rows}
    party_ids = {official['pidsInfo'][pid]['siglas']: pid for pid in official['pidsPA']}
    assert set(parties) == set(party_ids)
    for r in rows:
        assert f"{int(r['ID_DEPARTAMENTO']):02}{int(r['ID_MUNICIPIO']):02}" == code
        center, acta = official_rows[int(r['MESA'])]
        assert center == int(r['CENTRO_DE_VOTACIÓN'])
        assert acta['info']['imgSha'] == r['CÓDIGO_INTEGRIDAD']
        assert acta['info']['lNominal'] == int(r['PADRÓN'])
        assert r['CONTABILIZADA'] in ('0', '1')
        if r['CONTABILIZADA'] == '1':
            for party in parties:
                assert int(r[party]) == acta['votosPA'][party_ids[party]]['num']
    counted = [r for r in rows if r['CONTABILIZADA'] == '1']
    total = lambda field, items=counted: sum(int(r[field]) for r in items)
    assert len(counted) == int(summary['ACTAS_CONTABILIZADAS']) == official['stats']['actas']['cont']['num']
    assert total('PADRÓN') == int(summary['LISTA_NOMINAL_ACTAS_CONTABILIZADAS'])
    assert total('EMITIDOS_CALCULADO') == int(summary['VOTOS_EMITIDOS_CONTABILIZADAS'])
    assert len(rows) == int(summary['ACTAS_CAPTURADAS'])
    for party in parties:
        assert total(party) == official['votosPA'][party_ids[party]]['num']
    options_total = sum(total(p) for p in parties)
    order = sorted(parties, key=lambda p: (-total(p), p))
    leader, runner = order[:2]
    election = dict(
        election_code=CODE, election_name='Corporación Municipal · repetición del 20 de agosto',
        election_order=4, election_date='2023-08-20', snapshot=SNAPSHOT,
        result_status='PRELIMINARY_SNAPSHOT', expected_actas=len(rows),
        captured_actas=len(rows), captured_share=1, counted_actas=len(counted),
        counted_share=len(counted)/len(rows), nominal_roll_counted=total('PADRÓN'),
        votes_cast_counted=total('EMITIDOS_CALCULADO'), turnout_counted=total('EMITIDOS_CALCULADO')/total('PADRÓN'),
        valid_votes=total('VÁLIDOS'), null_votes=total('NULOS'), blank_votes=total('BLANCO'),
        ballot_option_votes=options_total, leader=leader, leader_votes=total(leader),
        leader_share=total(leader)/options_total, runner_up=runner, runner_up_votes=total(runner),
        margin_votes=total(leader)-total(runner), margin_share=(total(leader)-total(runner))/options_total,
    )
    center_metrics, matrix, crosswalk = [], [], []
    seen = set()
    for center in old['payload']['centers']:
        ids = mesas(center['jrv_ranges'])
        assert not seen.intersection(ids)
        seen.update(ids)
        local = [r for r in rows if int(r['MESA']) in ids]
        assert {int(r['MESA']) for r in local} == ids
        assert len(local) == center['total_jrv']
        assert total('PADRÓN', local) == center['registered_voters_center']
        local_counted = [r for r in local if r['CONTABILIZADA'] == '1']
        votes = [total(p, local_counted) for p in order]
        nominal = total('PADRÓN', local_counted)
        cast = total('EMITIDOS_CALCULADO', local_counted)
        center_metrics.append([center['voting_center_code'],len(local),len(local_counted),nominal,cast,
                               cast/nominal if nominal else None,total('VÁLIDOS',local_counted),
                               total('NULOS',local_counted),total('BLANCO',local_counted),sum(votes)])
        matrix.append(votes)
        crosswalk.append(dict(code=center['voting_center_code'],jrv_ranges=center['jrv_ranges'],
                              repeat_trep_center_codes=sorted({r['CENTRO_DE_VOTACIÓN'] for r in local})))
    assert seen == {int(r['MESA']) for r in rows}
    assert [sum(v[i] for v in matrix) for i in range(len(order))] == [total(p) for p in order]
    uncounted = [dict(mesa=int(r['MESA']), observation=r['OBSERVACIONES'], integrity=r['CÓDIGO_INTEGRIDAD'])
                 for r in rows if r['CONTABILIZADA'] == '0']
    source = dict(url=BASE+'GTM2023-segundaeleccion-20230820-231251.zip',
                  csv_file=csv_path.name, csv_sha256=digest(csv_path),
                  json_url=BASE+json_path.name, decoded_json_sha256=digest(json_path),
                  event='REPETICION_MUNICIPAL_2023_08_20', retrieved_on='2026-09-23',
                  center_crosswalk=crosswalk, uncounted_actas=uncounted,
                  reported_valid_votes=total('VÁLIDOS'), calculated_valid_votes=options_total,
                  guardrail='Corte TREP preliminar de la repetición municipal. Solo actas contabilizadas; '
                            'no sustituye la Memoria oficial. Válidos reportados y calculados se conservan separados. '
                            'No corresponde a la primera vuelta presidencial ni a elecciones legislativas.')
    source['display_notice'] = (
        f'Repetición municipal del 20 de agosto de 2023. Corte preliminar: {len(counted)}/{len(rows)} actas contabilizadas. '
        + ('Mesas 2318 y 2319: el TREP las registra como «Acta en Blanco», sin contabilizar. '
           'Válidos reportados: 4,345; suma de votos por partido: 4,346. Se conserva la discrepancia de la fuente. '
           if uncounted else '')
        + 'Los resultados de junio y de otras elecciones no se sustituyen por estos datos.'
    )
    payload = dict(municipality_code=code, municipality_name=old['payload']['municipality_name'],
                   department_code=code[:2],department_name=old['payload']['department_name'],
                   election=election, source=source,qa={'status':'PASS_CSV_JSON_JRV_RECONCILED'},
                   option_schema=['source','key','municipal_votes','municipal_share','municipal_rank'],
                   options=[[p,p.replace(' ','_'),total(p),total(p)/options_total,1+sum(total(q)>total(p) for q in order)] for p in order],
                   center_metric_schema=['code','captured','counted','nominal','cast','turnout','valid','null','blank','option_votes'],
                   center_metrics=center_metrics,votes_matrix={'rows':'center_metrics','columns':'options','values':matrix})
    layer = dict(layer_id=LAYER, period=SNAPSHOT,source_id='GT-TSE-TREP-2023-REPETICION-20230820',
                 source_label='TSE TREP · repetición municipal 20 agosto 2023 · corte 23:12 UTC-6',
                 source_status='DASHBOARD_READY',payload=payload)
    return layer


if __name__ == '__main__':
    indexes = json.loads((SRC/'retained-index.json').read_text())
    results = []
    for old in indexes:
        layer = build(old)
        code = old['municipality_code']
        (ROOT/f'scripts/fixtures/public-repeat-election-{code}.json').write_text(
            json.dumps({'municipality_code':code,'layers':[old,layer]},ensure_ascii=False,indent=2)+'\n')
        results.append({'municipality_code':code,**layer})
        print(code,layer['payload']['election'],layer['payload']['source']['uncounted_actas'])
    (ROOT/'supabase/fixtures/repeated-municipal-election-2023.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
