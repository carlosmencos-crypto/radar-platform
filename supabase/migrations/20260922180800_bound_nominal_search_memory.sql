-- Broad name searches produced lossy bitmaps at the default work_mem and took
-- 18.4 seconds for Guatemala. A scoped 32 MB budget retained exact bitmaps and
-- reduced the same authenticated query to 4.2 seconds. Keep the interactive
-- timeout, RLS, municipal filters and all unrelated sessions unchanged.
alter function private.radar_authorized_nominal_directory_v1(
  text,text,text,text,integer,integer,text,text,text,uuid,integer,integer
) set work_mem = '32MB';
