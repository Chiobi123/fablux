-- FabluX.U.Design — Paystack settlement layer
-- Apply with:  node db.js apply ../fab7/setup-payments.sql      (from _private-tools/)
-- Safe to re-run.
--
-- Money rules:
--   orders.total            = whole naira (bigint), as shown to the customer
--   payment_transactions.amount = kobo (naira * 100), exactly what Paystack charges
-- Only a verified gateway call can mark a Paystack order paid; the admin console
-- refuses to do it by hand.

-- ---------------------------------------------------------------------------
-- 1. Payment methods the store accepts
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('pay-on-delivery','bank-transfer','paystack'));

-- One live (unfinished) gateway attempt per order; finished attempts are kept.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tx_live
  ON public.payment_transactions(order_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Admin may not hand-confirm a gateway payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_payment_status(p_ref text, p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_from text;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE reference = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  v_from := v_order.payment_status;
  IF p_new_status NOT IN ('pending','successful','failed','refunded') THEN
    RAISE EXCEPTION 'Invalid payment status.';
  END IF;

  -- Gateway payments may only be confirmed by server-side verification.
  IF p_new_status = 'successful' AND v_order.payment_method IN ('card','paystack') THEN
    RAISE EXCEPTION 'Gateway payments must be confirmed by payment-provider verification, not manually.';
  END IF;
  IF v_from = 'successful' AND p_new_status = 'failed' THEN
    RAISE EXCEPTION 'Use a refund instead of reversing a successful payment.';
  END IF;

  UPDATE public.orders SET payment_status = p_new_status, payment_updated_at = iso_now()
   WHERE reference = p_ref;

  INSERT INTO public.order_events (order_id, event, label, actor)
  VALUES (v_order.id, 'payment_' || p_new_status,
          'Payment ' || p_new_status, coalesce((SELECT email FROM public.users WHERE id = auth.uid()::text),'system'));

  PERFORM public.audit('payment_status_change','orders',p_ref,
    jsonb_build_object('from', v_from, 'to', p_new_status, 'method', v_order.payment_method));

  IF p_new_status = 'successful' AND v_from <> 'successful' THEN
    PERFORM public.queue_notification(v_order.id, 'payment_successful',
      coalesce(v_order.guest_email, v_order.email),
      'Payment confirmed for FabluX order ' || v_order.reference,
      format('We confirmed your payment for order %s. Track it: https://fablux.pages.dev/track.html?ref=%s&token=%s',
             v_order.reference, v_order.reference, v_order.tracking_token));
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'fabluxdesigns@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'ujuigbani@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
  END IF;

  RETURN jsonb_build_object('reference', v_order.reference, 'payment_status', p_new_status);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Settlement: called only by the payments Edge Function (service_role)
--    Idempotent, amount-checked, and atomic with the order update.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_payment(
  p_reference text,
  p_amount integer,
  p_provider_status text DEFAULT 'success')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx public.payment_transactions%ROWTYPE; v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM public.payment_transactions WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment reference.';
  END IF;

  -- Replay protection: a verified transaction never settles twice.
  IF v_tx.status IN ('success','verified') THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'reference', v_tx.reference,
                              'order_reference', (SELECT reference FROM public.orders WHERE id = v_tx.order_id));
  END IF;

  IF p_amount IS DISTINCT FROM v_tx.amount THEN
    RAISE EXCEPTION 'Amount mismatch: expected % , got %', v_tx.amount, p_amount;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_tx.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.';
  END IF;

  UPDATE public.payment_transactions
     SET status = 'success',
         provider_status = coalesce(p_provider_status, 'success'),
         verified_at = public.iso_now(),
         updated_at = public.iso_now()
   WHERE id = v_tx.id;

  IF v_order.payment_status <> 'successful' THEN
    UPDATE public.orders
       SET payment_status = 'successful',
           status = CASE WHEN status = 'pending_payment' THEN 'payment_confirmed' ELSE status END,
           payment_updated_at = public.iso_now(),
           updated_at = public.iso_now()
     WHERE id = v_order.id;

    INSERT INTO public.order_events (order_id, event, label, actor)
    VALUES (v_order.id, 'payment_successful', 'Payment successful', 'payment-gateway');

    PERFORM public.audit('payment_status_change','orders',v_order.reference,
      jsonb_build_object('from', v_order.payment_status, 'to', 'successful',
                         'method', v_order.payment_method, 'provider', v_tx.provider,
                         'reference', v_tx.reference));

    PERFORM public.queue_notification(v_order.id, 'payment_successful',
      coalesce(v_order.guest_email, v_order.email),
      'Payment confirmed for FabluX order ' || v_order.reference,
      format('We confirmed your payment for order %s. Track it: https://fablux.pages.dev/track.html?ref=%s&token=%s',
             v_order.reference, v_order.reference, v_order.tracking_token));
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'fabluxdesigns@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'ujuigbani@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false,
                            'order_reference', v_order.reference, 'payment_status', 'successful');
END $$;

REVOKE ALL ON FUNCTION public.confirm_payment(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment(text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_payment(text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment(text, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Close abandoned attempts (run occasionally, or before a retry)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_payments()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.payment_transactions
     SET status = 'abandoned', updated_at = public.iso_now()
   WHERE status = 'pending' AND expires_at < public.iso_now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_payments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_payments() FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_payments() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_payments() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Checks
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
    RAISE EXCEPTION 'payment method constraint missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'confirm_payment') THEN
    RAISE EXCEPTION 'confirm_payment missing';
  END IF;
END $$;
