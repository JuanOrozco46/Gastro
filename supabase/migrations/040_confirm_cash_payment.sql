-- 040_confirm_cash_payment.sql
-- Separar la confirmación del pago en efectivo de la entrega de la orden.

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION confirm_cash_payment(p_payment_id UUID, p_order_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_restaurant_id UUID;
  v_payment RECORD;
  v_user_role TEXT;
  v_user_tenant UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_user_role, v_user_tenant
  FROM public.users
  WHERE id = v_user_id;

  IF v_user_role NOT IN ('owner', 'staff') OR v_user_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authorized: must be staff or owner';
  END IF;

  SELECT p.*, o.restaurant_id INTO v_payment
  FROM public.payments p
  JOIN public.orders o ON p.order_id = o.id
  WHERE p.id = p_payment_id AND p.order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or does not belong to order';
  END IF;

  IF v_payment.restaurant_id != v_user_tenant THEN
    RAISE EXCEPTION 'Order belongs to another restaurant';
  END IF;

  IF v_payment.provider != 'cash' THEN
    RAISE EXCEPTION 'Only cash payments can be confirmed manually';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment is not pending';
  END IF;

  UPDATE public.payments
  SET 
    status = 'approved',
    confirmed_by = v_user_id,
    confirmed_at = NOW()
  WHERE id = p_payment_id;

  INSERT INTO public.payment_audit_log (payment_id, order_id, actor_user_id, action_type)
  VALUES (p_payment_id, p_order_id, v_user_id, 'confirm_cash_payment');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION confirm_cash_payment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_cash_payment(UUID, UUID) TO authenticated;
