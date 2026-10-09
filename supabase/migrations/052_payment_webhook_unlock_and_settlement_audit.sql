-- ============================================================================
-- MIGRACIÓN 052: CONCILIACIÓN AUTOMÁTICA EN WEBHOOK WOMPI, AUDITORÍA DE TRANSACCIONES
-- Y REGISTRO DE TARIFA WOMPI EN CORTES DE LIQUIDACIÓN
-- ============================================================================

-- 1. Columnas de auditoría contable en public.payments para guardar el ID oficial de Wompi
-- y el sub-método real reportado por el webhook (NEQUI, PSE, CARD, BANCOLOMBIA_TRANSFER)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_method TEXT;

-- 2. Función + Trigger automático en public.payments:
-- Cada vez que un pago pasa a estado 'approved' (por ejemplo desde payment-webhook de Wompi),
-- asegura que platform_fee_cop, gateway_fee_cop, gateway_iva_cop y restaurant_payout_cop
-- estén calculados con precisión y ejecuta evaluate_restaurant_cash_limit_lock(restaurant_id)
-- para que el cruce automático desbloquee el efectivo en tiempo real si la deuda bajó del tope.
CREATE OR REPLACE FUNCTION public.handle_payment_status_change_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER;
  v_gateway_fee INTEGER;
  v_gateway_iva INTEGER;
  v_payout INTEGER;
BEGIN
  SELECT o.restaurant_id, COALESCE(r.commission_rate, 0.03)
  INTO v_restaurant_id, v_commission_rate
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.id = NEW.order_id;

  IF v_restaurant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si el pago tiene monto positivo y aún no tenía desglose de pasarela calculado, asegurar cálculo
  IF NEW.amount_cop > 0 AND (NEW.gateway_fee_cop IS NULL OR (NEW.gateway_fee_cop = 0 AND COALESCE(NEW.provider, 'wompi') != 'cash')) THEN
    v_platform_fee := ROUND(NEW.amount_cop * v_commission_rate)::INTEGER;
    v_gateway_fee := public.calculate_wompi_gateway_fee_cop(NEW.amount_cop, COALESCE(NEW.provider, 'wompi'));
    v_gateway_iva := public.calculate_wompi_gateway_iva_cop(NEW.amount_cop, COALESCE(NEW.provider, 'wompi'));
    v_payout := GREATEST(0, NEW.amount_cop - v_platform_fee - v_gateway_fee);

    UPDATE public.payments
    SET
      platform_fee_cop = v_platform_fee,
      gateway_fee_cop = v_gateway_fee,
      gateway_iva_cop = v_gateway_iva,
      restaurant_payout_cop = v_payout
    WHERE id = NEW.id;
  END IF;

  -- Si el pago fue aprobado, re-evaluar el cupo y desbloqueo automático de efectivo del restaurante
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.evaluate_restaurant_cash_limit_lock(v_restaurant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_status_settlement_sync ON public.payments;
CREATE TRIGGER trg_payment_status_settlement_sync
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_status_change_settlement();

-- 3. Actualizar record_restaurant_settlement para almacenar también p_wompi_gateway_fee_cop en el acta
DROP FUNCTION IF EXISTS public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.record_restaurant_settlement(
  p_restaurant_id UUID,
  p_settlement_type TEXT,
  p_net_amount_cop INTEGER,
  p_payment_channel TEXT DEFAULT 'transferencia_bancaria',
  p_reference_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_gross_sales_cop INTEGER DEFAULT 0,
  p_cash_sales_cop INTEGER DEFAULT 0,
  p_digital_sales_cop INTEGER DEFAULT 0,
  p_cash_commission_cop INTEGER DEFAULT 0,
  p_digital_commission_cop INTEGER DEFAULT 0,
  p_auto_offset_cop INTEGER DEFAULT 0,
  p_wompi_gateway_fee_cop INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_status TEXT := 'completed';
  v_settlement_id UUID;
BEGIN
  v_is_admin := public.is_platform_admin(v_uid);
  v_is_owner := public.is_restaurant_owner(v_uid, p_restaurant_id);

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'No autorizado para registrar liquidaciones de este restaurante.';
  END IF;

  IF p_settlement_type NOT IN ('platform_payout_to_restaurant', 'restaurant_payment_to_platform', 'auto_netted_zero_cut') THEN
    RAISE EXCEPTION 'Tipo de liquidación inválido.';
  END IF;

  IF p_settlement_type = 'platform_payout_to_restaurant' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo el Administrador de Plataforma puede registrar dispersiones hacia el restaurante.';
  END IF;

  IF p_net_amount_cop < 0 THEN
    RAISE EXCEPTION 'El monto neto de liquidación no puede ser negativo.';
  END IF;

  INSERT INTO public.restaurant_settlements (
    restaurant_id,
    settlement_type,
    gross_sales_cop,
    cash_sales_cop,
    digital_sales_cop,
    cash_commission_cop,
    digital_commission_cop,
    wompi_gateway_fee_cop,
    auto_offset_cop,
    net_amount_cop,
    payment_channel,
    reference_code,
    notes,
    status,
    period_end,
    created_by,
    confirmed_by,
    confirmed_at
  ) VALUES (
    p_restaurant_id,
    p_settlement_type,
    GREATEST(0, COALESCE(p_gross_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_sales_cop, 0)),
    GREATEST(0, COALESCE(p_digital_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_commission_cop, 0)),
    GREATEST(0, COALESCE(p_digital_commission_cop, 0)),
    GREATEST(0, COALESCE(p_wompi_gateway_fee_cop, 0)),
    GREATEST(0, COALESCE(p_auto_offset_cop, 0)),
    GREATEST(0, COALESCE(p_net_amount_cop, 0)),
    COALESCE(NULLIF(btrim(p_payment_channel), ''), 'transferencia_bancaria'),
    COALESCE(NULLIF(btrim(p_reference_code), ''), 'GS-LIQ-' || floor(extract(epoch from now()))::TEXT),
    NULLIF(btrim(p_notes), ''),
    v_status,
    NOW(),
    v_uid,
    v_uid,
    NOW()
  )
  RETURNING id INTO v_settlement_id;

  -- Re-evaluar inmediatamente el cupo de efectivo para reactivar pagos en efectivo si se saldó la deuda
  PERFORM public.evaluate_restaurant_cash_limit_lock(p_restaurant_id);

  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
