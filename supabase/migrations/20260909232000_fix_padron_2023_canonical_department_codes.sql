-- RADAR Guatemala · Padrón detallado 2023 · corrección canónica departamentos 02/03/04
--
-- Producto fuente: GT_RADAR_PADRON_2023_AGREGADOS_340_v1
-- El producto agrega 340 municipios y 8,947,471 registros sin PII. En el workbook,
-- municipality_code fue construido con el ordinal del archivo departamental para tres
-- fuentes: 2=Sacatepéquez, 3=Chimaltenango, 4=El Progreso. El catálogo canónico RADAR/TSE
-- usa 02=El Progreso, 03=Sacatepéquez, 04=Chimaltenango.
--
-- Esta migración remapea únicamente esos 40 municipios al código canónico y es idempotente.
-- No mezcla este universo detallado 2023 con el total oficial TSE ni con 2026.

with src(
  municipality_code,
  elector_count,
  community_count,
  average_age_base,
  age_missing_count,
  age_18_29,
  age_30_44,
  age_45_59,
  age_60_plus,
  reconciliation_delta
) as (
  values
    ('0201',22174,46,42.6,0,5648,7743,4854,3929,0),
    ('0202',9610,84,43.79,0,2316,3187,2185,1922,0),
    ('0203',25969,92,42.51,0,6289,9400,6008,4272,0),
    ('0204',5820,35,42.22,0,1559,1969,1290,1002,0),
    ('0205',9960,22,43.41,0,2428,3305,2369,1858,0),
    ('0206',10092,42,43.65,0,2319,3461,2454,1858,0),
    ('0207',26412,109,44.06,0,5514,9473,6412,5013,0),
    ('0208',13618,58,42.05,0,3371,5012,3060,2175,0),
    ('0301',38073,69,44.7,0,7597,13269,9434,7773,0),
    ('0302',14401,20,43.62,0,3141,5167,3449,2644,0),
    ('0303',10363,11,42.72,0,2365,3919,2381,1698,0),
    ('0304',19665,37,42.81,0,4039,7868,4550,3208,0),
    ('0305',7271,18,40.72,0,2006,2792,1455,1018,0),
    ('0306',17217,30,41.75,0,3926,6975,3775,2541,0),
    ('0307',5132,2,41.67,0,1285,1894,1185,768,0),
    ('0308',16722,71,43.33,0,3688,5979,4120,2935,0),
    ('0309',9656,24,41.98,0,2267,3741,2231,1417,0),
    ('0310',6960,18,41.8,0,1683,2734,1510,1033,0),
    ('0311',12113,16,40.9,0,3196,4816,2326,1775,0),
    ('0312',18189,20,43.26,0,3792,6959,4256,3182,0),
    ('0313',7179,21,43.79,0,1338,2886,1722,1233,0),
    ('0314',12309,19,43.4,1,2487,4869,2777,2175,0),
    ('0315',7176,4,43.14,0,1713,2573,1592,1298,0),
    ('0316',3553,3,40.35,0,1069,1320,664,500,0),
    ('0401',55782,56,42.15,0,12747,21674,12806,8555,0),
    ('0402',14747,41,41.87,0,3544,5575,3534,2094,0),
    ('0403',39742,170,43.73,0,8489,14462,9360,7431,0),
    ('0404',24530,44,44.32,0,4470,9425,6158,4477,0),
    ('0405',10324,40,39.15,0,3322,3774,2037,1191,0),
    ('0406',39151,78,42.79,0,8099,15449,9482,6121,0),
    ('0407',33201,55,42.3,0,7848,12479,7784,5090,0),
    ('0408',5904,49,43.49,0,1422,2019,1315,1148,0),
    ('0409',19430,29,42.58,0,4304,7633,4345,3148,0),
    ('0410',6149,7,40.16,0,1803,2294,1242,810,0),
    ('0411',13836,56,42.26,0,3399,5129,3031,2277,0),
    ('0412',18110,61,40.72,0,5296,6532,3521,2761,0),
    ('0413',17539,43,41.3,0,4740,6438,3734,2627,0),
    ('0414',9615,31,39.98,0,2867,3620,1886,1242,0),
    ('0415',13808,28,42.63,0,3230,5081,3219,2278,0),
    ('0416',14780,34,42.06,0,3361,5796,3445,2178,0)
)
insert into data_vault.voter_roll_municipal_aggregates (
  municipality_id,
  source_year,
  elector_count,
  community_count,
  average_age_base,
  age_missing_count,
  age_18_29,
  age_30_44,
  age_45_59,
  age_60_plus,
  reconciliation_delta,
  source_product_id,
  updated_at
)
select
  m.id,
  2023,
  s.elector_count,
  s.community_count,
  s.average_age_base,
  s.age_missing_count,
  s.age_18_29,
  s.age_30_44,
  s.age_45_59,
  s.age_60_plus,
  s.reconciliation_delta,
  'GT_RADAR_PADRON_2023_AGREGADOS_340_v1',
  now()
from src s
join public.municipalities m
  on m.country_code = 'GT'
 and m.municipality_code = s.municipality_code
on conflict (municipality_id, source_year) do update set
  elector_count = excluded.elector_count,
  community_count = excluded.community_count,
  average_age_base = excluded.average_age_base,
  age_missing_count = excluded.age_missing_count,
  age_18_29 = excluded.age_18_29,
  age_30_44 = excluded.age_30_44,
  age_45_59 = excluded.age_45_59,
  age_60_plus = excluded.age_60_plus,
  reconciliation_delta = excluded.reconciliation_delta,
  source_product_id = excluded.source_product_id,
  updated_at = now();

-- Fail closed if the corrected aggregate no longer matches the validated source product.
do $validation$
declare
  v_rows integer;
  v_electors bigint;
  v_reconciliation_failures integer;
begin
  select
    count(*),
    sum(v.elector_count)::bigint,
    count(*) filter (
      where coalesce(v.age_18_29, 0)
          + coalesce(v.age_30_44, 0)
          + coalesce(v.age_45_59, 0)
          + coalesce(v.age_60_plus, 0)
          + coalesce(v.age_missing_count, 0) <> v.elector_count
         or coalesce(v.reconciliation_delta, 0) <> 0
    )
  into v_rows, v_electors, v_reconciliation_failures
  from data_vault.voter_roll_municipal_aggregates v
  where v.source_year = 2023
    and v.source_product_id = 'GT_RADAR_PADRON_2023_AGREGADOS_340_v1';

  if v_rows <> 340 then
    raise exception 'RADAR PADRON 2023 validation failed: expected 340 municipalities, got %', v_rows;
  end if;

  if v_electors <> 8947471 then
    raise exception 'RADAR PADRON 2023 validation failed: expected 8947471 electors, got %', v_electors;
  end if;

  if v_reconciliation_failures <> 0 then
    raise exception 'RADAR PADRON 2023 validation failed: % reconciliation failures', v_reconciliation_failures;
  end if;
end
$validation$;
