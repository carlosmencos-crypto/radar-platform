-- The route context resolves one municipality. The default 1000-row estimate
-- made layer joins scan and authorize every municipality before filtering.
-- This changes only planner metadata, not function bodies, rows or privileges.
alter function public.radar_authorized_context_v2(text,text) rows 1;
