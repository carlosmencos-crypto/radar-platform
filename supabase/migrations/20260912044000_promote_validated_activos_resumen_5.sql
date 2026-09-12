-- RADAR Guatemala: promote the already validated municipal asset summaries for the
-- five municipalities where ACTIVOS_RESUMEN is part of the canonical visible contract.
-- Source: GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1.
-- Scope is summary-by-account only; no individual asset detail is inferred.

with source_rows(municipality_code, period, source_status, payload) as (
  values
  ('0312','2025','READY_VALIDATED_SUMMARY_ONLY', jsonb_build_object('municipality_code','0312','municipality_name','Ciudad Vieja','department_name','Sacatepéquez','period','2025','cutoff_date','2025-12-31','asset_total_gtq',175313349.21,'pages',48,'accounts_count',11,'raw_file','GT_MUNI_0312_ACTIVOS_INVENTARIO_2025_RAW_001.pdf','raw_sha256','d0556f5e12408712500983cce7d73b24140fc5ba14af625a2a4b263987ee30a0','hash_check','PASS','qa_status','PASS','coverage_status','READY_VALIDATED_SUMMARY_ONLY','frontend_scope','resumen_contable_por_cuenta','data_present',true,'source_product_id','GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1','source_url','https://docs.google.com/spreadsheets/d/1tudz6JQDdXsNiWF470EK3_GEToMesCT2NHPK3sQ79WU/edit','notes','Detalle individual de bienes pendiente; no bloquea frontend de resumen.')),
  ('0916','2025','READY_VALIDATED_SUMMARY_ONLY', jsonb_build_object('municipality_code','0916','municipality_name','Zunil','department_name','Quetzaltenango','period','2025','cutoff_date','2025-12-31','asset_total_gtq',139153118.88,'pages',46,'accounts_count',9,'raw_file','GT_MUNI_0916_ACTIVOS_INVENTARIO_2025_RAW_001.pdf','raw_sha256','44806813952ab0e8fd7eaa928a92cf8a348876a63cc0798c5d6d33b991d90dac','hash_check','PASS','qa_status','PASS','coverage_status','READY_VALIDATED_SUMMARY_ONLY','frontend_scope','resumen_contable_por_cuenta','data_present',true,'source_product_id','GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1','source_url','https://docs.google.com/spreadsheets/d/1tudz6JQDdXsNiWF470EK3_GEToMesCT2NHPK3sQ79WU/edit','notes','Inventario al 31/12/2025 publicado como vigente 2026; detalle individual pendiente.')),
  ('1610','2025','READY_VALIDATED_SUMMARY_ONLY_WITH_DATE_CONFLICT', jsonb_build_object('municipality_code','1610','municipality_name','San Juan Chamelco','department_name','Alta Verapaz','period','2025','cutoff_date','2025-12-31','asset_total_gtq',95451559.98,'pages',65,'accounts_count',11,'raw_file','GT_MUNI_1610_ACTIVOS_INVENTARIO_2025_RAW_001.pdf','raw_sha256','96c52807d48a3a634e9f9c1d378361b6bc513e9af0047c7c0c2f4be417b8060d','hash_check','PASS','qa_status','PASS','coverage_status','READY_VALIDATED_SUMMARY_ONLY_WITH_DATE_CONFLICT','frontend_scope','resumen_contable_por_cuenta','data_present',true,'source_product_id','GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1','source_url','https://docs.google.com/spreadsheets/d/1tudz6JQDdXsNiWF470EK3_GEToMesCT2NHPK3sQ79WU/edit','notes','Certificación/resumen final 31/12/2025; página 1 contiene referencia aislada a 31/12/2024. Conflicto preservado.')),
  ('1709','2026-05','READY_VALIDATED_SUMMARY_ONLY', jsonb_build_object('municipality_code','1709','municipality_name','San Luis','department_name','Petén','period','2026-05','cutoff_date','2026-05-31','asset_total_gtq',287857518.13,'pages',30,'accounts_count',10,'raw_file','GT_MUNI_1709_ACTIVOS_INVENTARIO_2026_05_RAW_001.pdf','raw_sha256','2568bab36e791782b2c34f5e55420cc044c81cf2023f3ec8d2083ef5343a5142','hash_check','PASS','qa_status','PASS','coverage_status','READY_VALIDATED_SUMMARY_ONLY','frontend_scope','resumen_contable_por_cuenta','data_present',true,'source_product_id','GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1','source_url','https://docs.google.com/spreadsheets/d/1tudz6JQDdXsNiWF470EK3_GEToMesCT2NHPK3sQ79WU/edit','notes','Inventario con fecha 31/05/2026; periodo distinto documentado y no mezclado con 2025.')),
  ('1901','2025','READY_VALIDATED_SUMMARY_ONLY', jsonb_build_object('municipality_code','1901','municipality_name','Zacapa','department_name','Zacapa','period','2025','cutoff_date','2025-12-31','asset_total_gtq',183117971.66,'pages',150,'accounts_count',12,'raw_file','GT_MUNI_1901_ACTIVOS_INVENTARIO_2025_RAW_001.pdf','raw_sha256','2c19a807283e94c02ea7832ede90af11d2d77f6a8ea3a611ad3ee5c3e6247','hash_check','PASS','qa_status','PASS','coverage_status','READY_VALIDATED_SUMMARY_ONLY','frontend_scope','resumen_contable_por_cuenta','data_present',true,'source_product_id','GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1','source_url','https://docs.google.com/spreadsheets/d/1tudz6JQDdXsNiWF470EK3_GEToMesCT2NHPK3sQ79WU/edit','notes','Inventario certificado al 31/12/2025; detalle individual pendiente.'))
)
insert into data_vault.municipality_layer_records(
  country_code, municipality_id, layer_id, period, source_id, source_label,
  payload, source_status, generated_at
)
select
  'GT', m.id, 'ACTIVOS_RESUMEN', s.period,
  'GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1',
  'Activos municipales · resumen contable validado',
  s.payload, s.source_status, now()
from source_rows s
join public.municipalities m
  on m.country_code='GT'
 and m.municipality_code=s.municipality_code
 and m.is_synthetic=false
on conflict (municipality_id, layer_id, period, source_id) do update
set payload=excluded.payload,
    source_status=excluded.source_status,
    source_label=excluded.source_label,
    generated_at=excluded.generated_at,
    updated_at=now();
