-- Bound only the temporary service-only import RPC. Interactive roles keep
-- their existing timeouts; no global database or plan setting is changed.
alter function public.radar_ingest_private_register_batch_v1(uuid,text,integer,text)
  set statement_timeout = '20s';
notify pgrst, 'reload schema';
