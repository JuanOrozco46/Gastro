-- Migración 010: Habilitar Supabase Realtime para la tabla payments (Fase 5C)
-- Esto permite que los clientes escuchen cambios en sus propios pagos usando WebSockets.
-- La seguridad se mantiene por la política RLS payments_select_policy.

DO $$
BEGIN
  -- Comprobar si la publicación supabase_realtime existe
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Comprobar si la tabla ya está en la publicación
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
    END IF;
  END IF;
END $$;
