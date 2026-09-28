-- Migration: 033_realtime_notifications.sql
-- Notifications were stored but never delivered live: the `notifications` table
-- was not part of the `supabase_realtime` publication (the publication had no
-- tables at all), so any client subscription would receive nothing, and the bell
-- in app-shell.tsx only fetched once on mount — a new notification appeared only
-- after a manual page reload.
--
-- This publishes the table and sets REPLICA IDENTITY FULL so UPDATE events carry
-- every column, which the per-user `recipient_user_id=eq.<uuid>` filter needs in
-- order to match on read-state changes.
-- Date: 2026-09-28

-- 1. Publish the notifications table (idempotent: skip if already published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

-- 2. Full row images so filtered UPDATE/DELETE events match on non-PK columns.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 3. Keep the announcement is not needed for RLS-protected reads: realtime
--    respects RLS, so a recipient only ever receives their own rows.
