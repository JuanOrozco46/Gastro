-- Migración 009: Estados Extendidos de Pago para Webhooks (Fase 5B)

-- Ampliar la validación de estados de pago permitiendo pending, approved, declined, voided, refunded, failed
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'approved', 'declined', 'voided', 'refunded', 'failed'));

-- Garantizar que no existan políticas de UPDATE o DELETE accidentales.
-- La modificación de pagos ocurre únicamente vía webhooks desde el backend con Service Role.
DROP POLICY IF EXISTS "payments_update_policy" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_policy" ON public.payments;
