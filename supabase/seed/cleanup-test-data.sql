-- Deletes only rows whose names or guest labels start with TEST-.
-- Does not touch Navarro, Tagosilangan, or any other live setup rows.
-- Does not delete auth users on hosted Supabase (those rows are not TEST- prefixed).

delete from public.hotels where name like 'TEST-%';

delete from public.guests where full_name like 'TEST-%';

delete from public.profiles where full_name like 'TEST-%';
