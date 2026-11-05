-- Índices para las claves foráneas que no tenían uno (aviso de rendimiento de Supabase).
-- Aceleran los joins y los borrados en cascada o "set null".
create index if not exists projects_pattern_idx on public.projects (pattern_id);
create index if not exists user_yarns_weight_idx on public.user_yarns (weight);
create index if not exists user_yarns_palette_idx on public.user_yarns (palette_id);
create index if not exists uploads_owner_idx on public.uploads (owner_id);
create index if not exists ai_jobs_upload_idx on public.ai_jobs (upload_id);
create index if not exists ai_jobs_result_pattern_idx on public.ai_jobs (result_pattern_id);
