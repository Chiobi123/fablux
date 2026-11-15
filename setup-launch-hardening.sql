-- ============================================================================
-- FabluX.U.Design — LAUNCH HARDENING (Supabase / PostgreSQL)
-- Run AFTER every other setup-*.sql file. Safe to run repeatedly.
--
-- What this closes (audit 2026-11-14):
--   1. anon could EXECUTE internal SECURITY DEFINER helpers
--      (queue_notification / audit / contact + welcome triggers) → anyone with
--      the publishable key could queue unlimited mail through the store sender
--   2. reviews_insert let a customer publish their own review, unmoderated
--   3. create_order accepted quantity <= 0 and had no throttle
--   4. cancelling an order never returned the stock it reserved
--   5. notifications were written as 'pending' when mail was off, and
--      dispatch_emails() marked a row 'sent' the moment it *submitted* the HTTP
--      request — a rejected send still looked delivered
--   6. pg_cron / pg_net response tables grew forever
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Internal helpers: owner-only. Called by create_order() and the admin RPCs,
--    which are SECURITY DEFINER and therefore keep access through ownership.
--    Trigger functions are included because they can never be called directly.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.queue_notification(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit(TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_contact_alert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_welcome_email()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_admin_role()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_auth_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_user_email()
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Reviews: a customer may submit, never publish. Admin approves.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS reviews_insert ON public.reviews;
CREATE POLICY reviews_insert ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (auth.uid())::text
    AND status = 'pending'
    AND rating BETWEEN 1 AND 5
  );

-- ----------------------------------------------------------------------------
-- 3. Outbox: rows always start life queued. dispatch_emails() decides whether
--    to send; there is no second "disabled" state to get stuck in.
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications ALTER COLUMN status SET DEFAULT 'queued';

CREATE OR REPLACE FUNCTION public.queue_notification(
  p_order_id TEXT, p_event TEXT, p_recipient TEXT, p_subject TEXT, p_body TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to TEXT := lower(btrim(coalesce(p_recipient, '')));
BEGIN
  IF v_to = '' OR position('@' IN v_to) < 2 THEN RETURN; END IF;

  INSERT INTO public.notifications
    (order_id, event, channel, recipient, subject, body, status, error)
  VALUES (p_order_id, p_event, 'email', v_to, p_subject, p_body, 'queued', NULL);
END $$;

-- Track which pg_net request each row was handed to, so a later run can read
-- the provider's real answer instead of assuming success.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS provider_request_id BIGINT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.dispatch_emails(p_limit INTEGER DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key TEXT; v_from TEXT; v_name TEXT; v_reply TEXT;
  v_req BIGINT; r RECORD; n INT := 0;
BEGIN
  -- ---- 1. Settle rows whose response has arrived -------------------------
  UPDATE public.notifications nt
     SET status  = CASE WHEN h.status_code BETWEEN 200 AND 299 THEN 'sent'
                        WHEN nt.attempts >= 4 THEN 'failed' ELSE 'queued' END,
         sent_at = CASE WHEN h.status_code BETWEEN 200 AND 299 THEN now() ELSE nt.sent_at END,
         error   = CASE WHEN h.status_code BETWEEN 200 AND 299 THEN NULL
                        ELSE left('HTTP ' || h.status_code || ' ' || coalesce(h.content, ''), 300) END
    FROM net._http_response h
   WHERE nt.status = 'sending'
     AND nt.provider_request_id = h.id;

  -- ---- 2. Give up on requests that never answered ------------------------
  UPDATE public.notifications nt
     SET status = CASE WHEN nt.attempts >= 4 THEN 'failed' ELSE 'queued' END,
         error  = 'No response from the email provider.'
   WHERE nt.status = 'sending'
     AND nt.dispatched_at < now() - INTERVAL '10 minutes'
     AND NOT EXISTS (SELECT 1 FROM net._http_response h WHERE h.id = nt.provider_request_id);

  IF coalesce((SELECT value FROM public.settings WHERE key = 'email_enabled'), 'false') <> 'true' THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'brevo_api_key' LIMIT 1;
  SELECT from_email, from_name, coalesce(nullif(reply_to, ''), from_email)
    INTO v_from, v_name, v_reply FROM public.email_settings WHERE id = 1;
  IF v_key IS NULL OR v_from IS NULL THEN RETURN 0; END IF;

  -- ---- 3. Submit the queue ----------------------------------------------
  FOR r IN
    SELECT id, recipient, subject, body, reply_to FROM public.notifications
     WHERE channel = 'email' AND status = 'queued' AND attempts < 4 AND recipient <> ''
     ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_req := net.http_post(
        url := 'https://api.brevo.com/v3/smtp/email',
        headers := jsonb_build_object('api-key', v_key, 'content-type', 'application/json'),
        body := jsonb_build_object(
          'sender', jsonb_build_object('name', v_name, 'email', v_from),
          'to', jsonb_build_array(jsonb_build_object('email', r.recipient)),
          'replyTo', jsonb_build_object('email', coalesce(nullif(r.reply_to, ''), v_reply), 'name', v_name),
          'subject', coalesce(nullif(r.subject, ''), 'FabluX.U.Design'),
          'textContent', coalesce(r.body, '')
        ));
      UPDATE public.notifications
         SET status = 'sending', provider_request_id = v_req, dispatched_at = now(),
             attempts = attempts + 1, error = NULL
       WHERE id = r.id;
      n := n + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.notifications
         SET attempts = attempts + 1,
             status = CASE WHEN attempts + 1 >= 4 THEN 'failed' ELSE 'queued' END,
             error = left(SQLERRM, 300)
       WHERE id = r.id;
    END;
  END LOOP;

  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_emails(INTEGER) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. create_order: reject nonsense quantities, throttle checkout attempts.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_items jsonb, p_name text, p_phone text, p_address text, p_city text, p_state text,
  p_delivery_method text DEFAULT 'standard', p_payment_method text DEFAULT 'pay-on-delivery',
  p_guest_email text DEFAULT NULL, p_landmark text DEFAULT NULL,
  p_instructions text DEFAULT NULL, p_promo text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_email        text;
  v_line         jsonb := '[]'::jsonb;
  v_pid          text;
  v_qty          numeric;
  v_prod         public.products%ROWTYPE;
  v_subtotal     bigint := 0;
  v_fee          bigint := 0;
  v_base         bigint := 0;
  v_discount     bigint := 0;
  v_promo        text := NULL;
  v_check        jsonb;
  v_total        bigint := 0;
  v_order_id     text;
  v_ref          text;
  v_token        text;
  v_created      text;
  v_dup          public.orders%ROWTYPE;
BEGIN
  -- ---- duplicate-submit protection -------------------------------------
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_dup FROM public.orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'order_id', v_dup.id,
        'reference', v_dup.reference, 'tracking_token', v_dup.tracking_token,
        'status', v_dup.status, 'payment_status', v_dup.payment_status,
        'subtotal', v_dup.subtotal, 'delivery_fee', v_dup.delivery_fee,
        'discount', v_dup.discount, 'promo_code', v_dup.promo_code,
        'total', v_dup.total, 'currency', v_dup.currency, 'created_at', v_dup.created_at);
    END IF;
  END IF;

  -- ---- who is buying -----------------------------------------------------
  IF v_uid IS NULL THEN
    v_email := lower(coalesce(trim(p_guest_email),''));
    IF v_email = '' THEN RAISE EXCEPTION 'Enter your email address to continue as a guest.'; END IF;
  ELSE
    SELECT email INTO v_email FROM public.users WHERE id = v_uid::text;
    v_email := coalesce(v_email, lower(coalesce(trim(p_guest_email),'')));
  END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'A valid email address is required.'; END IF;

  -- ---- delivery information validation ----------------------------------
  IF coalesce(trim(p_name),'')  = '' THEN RAISE EXCEPTION 'Recipient full name is required.'; END IF;
  IF coalesce(trim(p_phone),'') = '' THEN RAISE EXCEPTION 'Active phone number is required.'; END IF;
  IF coalesce(trim(p_address),'') = '' THEN RAISE EXCEPTION 'Delivery address is required.'; END IF;
  IF coalesce(trim(p_city),'')  = '' THEN RAISE EXCEPTION 'City or town is required.'; END IF;
  IF coalesce(trim(p_state),'') = '' THEN RAISE EXCEPTION 'State is required.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.'; END IF;

  -- ---- quantities must be whole numbers of at least one -----------------
  -- Without this an empty or negative quantity is silently clamped to 1, so a
  -- crafted request can reserve stock while paying for nothing sensible.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e
     WHERE coalesce(e->>'quantity','') !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'Each item needs a whole-number quantity.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e
     WHERE (e->>'quantity')::numeric < 1
  ) THEN
    RAISE EXCEPTION 'Each item needs a quantity of at least 1.';
  END IF;

  -- ---- throttling --------------------------------------------------------
  -- ponytail: per-email and per-phone, because anon has no stable identity.
  -- A determined attacker can rotate both; add an edge/WAF rule or captcha if
  -- that ever shows up in the logs.
  IF NOT public.rate_limit_hit('checkout', v_email, 20, 3600) THEN
    RAISE EXCEPTION 'Too many checkout attempts from this email. Please try again later.';
  END IF;
  IF NOT public.rate_limit_hit('checkout_phone',
       regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'), 20, 3600) THEN
    RAISE EXCEPTION 'Too many checkout attempts from this phone number. Please try again later.';
  END IF;

  -- ---- line items: merge duplicates, lock rows, price from DB ------------
  FOR v_pid, v_qty IN
    SELECT coalesce(e->>'product_id',''),
           sum(least(99, (e->>'quantity')::numeric))
      FROM jsonb_array_elements(p_items) e
     GROUP BY 1
  LOOP
    IF v_pid = '' THEN RAISE EXCEPTION 'Invalid product in cart.'; END IF;
    SELECT * INTO v_prod FROM public.products
      WHERE id = v_pid AND active = 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product in your cart is no longer available.'; END IF;
    IF v_prod.stock < v_qty THEN
      RAISE EXCEPTION 'Not enough stock for "%" (available: %).', v_prod.name, v_prod.stock; END IF;

    UPDATE public.products
       SET stock = stock - v_qty, updated_at = iso_now()
     WHERE id = v_pid;

    v_subtotal := v_subtotal + (v_prod.price::bigint * v_qty::bigint);
    v_line := v_line || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price,
      'quantity', v_qty::int, 'line_total', (v_prod.price::bigint * v_qty::bigint));
  END LOOP;

  -- ---- delivery charge from admin-configurable rules ---------------------
  SELECT coalesce(nullif(value,'')::bigint, 2500) INTO v_base
    FROM public.settings WHERE key = 'delivery_fee_default';
  v_fee := v_base;
  IF lower(coalesce(p_delivery_method,'standard')) = 'express' THEN
    v_fee := v_fee + coalesce((SELECT value::bigint FROM public.settings
                                WHERE key = 'delivery_fee_express_surcharge'), 0);
  END IF;

  -- ---- promo / discount code: checked by the database, never by the page ----
  IF p_promo IS NOT NULL AND btrim(p_promo) <> '' THEN
    v_check := public.validate_promo(btrim(p_promo), v_subtotal);
    IF coalesce((v_check->>'valid')::boolean, false) THEN
      v_discount := coalesce((v_check->>'discount')::bigint, 0);
      v_promo    := v_check->>'code';
      UPDATE public.promo_codes
         SET used_count = used_count + 1, updated_at = iso_now()
       WHERE code = v_promo;
    ELSE
      RAISE EXCEPTION '%', coalesce(v_check->>'message', 'That promo code is not valid.');
    END IF;
  END IF;
  v_total := greatest(0, v_subtotal + v_fee - v_discount);

  -- ---- persist -----------------------------------------------------------
  v_order_id := 'ord_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
  v_ref      := 'FX-' || to_char(now(),'YYYY') || '-' || lpad(nextval('order_reference_seq')::text, 5, '0');
  v_token     := encode(gen_random_bytes(24),'hex');
  v_created   := iso_now();

  INSERT INTO public.orders (
    id, reference, user_id, guest_email, status, payment_status,
    subtotal, delivery_fee, discount, total, currency, promo_code,
    payment_method, delivery_method, customer_name, email, phone,
    address, city, state, landmark, instructions,
    tracking_token, idempotency_key, created_at, updated_at, status_updated_at)
  VALUES (
    v_order_id, v_ref, v_uid::text, CASE WHEN v_uid IS NULL THEN lower(trim(p_guest_email)) END,
    'pending_payment', 'pending',
    v_subtotal, v_fee, v_discount, v_total, 'NGN', v_promo,
    coalesce(p_payment_method,'pay-on-delivery'), coalesce(p_delivery_method,'standard'),
    trim(p_name), v_email, regexp_replace(trim(p_phone),'[^0-9+]','','g'),
    trim(p_address), trim(p_city), trim(p_state),
    nullif(trim(coalesce(p_landmark,'')),''), nullif(trim(coalesce(p_instructions,'')),''),
    v_token, nullif(p_idempotency_key,''), v_created, v_created, v_created);

  INSERT INTO public.order_items (order_id, product_id, name, price, quantity)
  SELECT v_order_id, e->>'product_id', e->>'name', (e->>'price')::bigint, (e->>'quantity')::int
    FROM jsonb_array_elements(v_line) e;

  -- ---- events + notifications -------------------------------------------
  INSERT INTO public.order_events (order_id, event, label, actor)
  VALUES (v_order_id, 'order_received', 'Order received', 'system'),
         (v_order_id, 'payment_pending', 'Awaiting payment confirmation', 'system');

  PERFORM public.queue_notification(v_order_id, 'admin_new_order', 'ujunwaigbani@gmail.com',
    'New FabluX order ' || v_ref,
    public.admin_alert_body(v_ref, v_total, 'pending', 'pending_payment'));
  PERFORM public.queue_notification(v_order_id, 'admin_new_order', 'igbanichiobiebere@gmail.com',
    'New FabluX order ' || v_ref,
    public.admin_alert_body(v_ref, v_total, 'pending', 'pending_payment'));
  PERFORM public.queue_notification(v_order_id, 'order_received', v_email,
    'We received your FabluX order ' || v_ref,
    format('Your order %s was received. Total NGN %s. Track it any time: https://fablux.pages.dev/track.html?ref=%s&token=%s',
           v_ref, v_total, v_ref, v_token));

  RETURN jsonb_build_object(
    'duplicate', false, 'order_id', v_order_id, 'reference', v_ref,
    'tracking_token', v_token, 'status', 'pending_payment', 'payment_status', 'pending',
    'subtotal', v_subtotal, 'delivery_fee', v_fee, 'discount', v_discount,
    'promo_code', v_promo, 'total', v_total,
    'currency', 'NGN', 'created_at', v_created);
END $$;

-- ----------------------------------------------------------------------------
-- 5. Cancelling an order returns its stock.
--    The function already refuses to leave 'cancelled', so this can only run
--    once per order and cannot double-credit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_order_status(p_ref text, p_new_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_label text;
  v_from  text;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE reference = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  v_from := v_order.status;

  IF NOT (v_from = p_new_status) THEN
    IF v_from = 'cancelled' OR v_from = 'delivered' THEN
      RAISE EXCEPTION 'Order is already % and can no longer change.', v_from; END IF;
    IF NOT (
      (v_from = 'pending_payment' AND p_new_status IN ('payment_confirmed','confirmed','cancelled')) OR
      (v_from = 'payment_confirmed' AND p_new_status IN ('confirmed','cancelled')) OR
      (v_from = 'confirmed' AND p_new_status IN ('processing','cancelled')) OR
      (v_from = 'processing' AND p_new_status IN ('ready_for_dispatch','cancelled')) OR
      (v_from = 'ready_for_dispatch' AND p_new_status IN ('shipped','cancelled')) OR
      (v_from = 'shipped' AND p_new_status IN ('delivered','cancelled')))
    THEN
      RAISE EXCEPTION 'Invalid status change: % to %.', v_from, p_new_status; END IF;
  END IF;

  UPDATE public.orders
     SET status = p_new_status, status_updated_at = iso_now(), updated_at = iso_now(),
         cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN iso_now() ELSE cancelled_at END,
         delivered_at = CASE WHEN p_new_status = 'delivered' THEN iso_now() ELSE delivered_at END
   WHERE reference = p_ref;

  -- Release the reserved stock so a cancelled order does not leak inventory.
  IF p_new_status = 'cancelled' THEN
    UPDATE public.products p
       SET stock = p.stock + x.qty, updated_at = iso_now()
      FROM (SELECT product_id, sum(quantity)::int AS qty
              FROM public.order_items
             WHERE order_id = v_order.id
             GROUP BY product_id) x
     WHERE p.id = x.product_id;
  END IF;

  v_label := CASE p_new_status
    WHEN 'pending_payment' THEN 'Order received'
    WHEN 'payment_confirmed' THEN 'Payment confirmed'
    WHEN 'confirmed' THEN 'Order confirmed'
    WHEN 'processing' THEN 'Preparing parcel'
    WHEN 'ready_for_dispatch' THEN 'Ready for dispatch'
    WHEN 'shipped' THEN 'Collected by courier'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'cancelled' THEN 'Order cancelled' ELSE p_new_status END;

  INSERT INTO public.order_events (order_id, event, label, actor)
  VALUES (v_order.id, p_new_status, v_label,
          coalesce((SELECT email FROM public.users WHERE id = auth.uid()::text),'system'));

  PERFORM public.audit('order_status_change','orders',p_ref,
    jsonb_build_object('from', v_from, 'to', p_new_status));

  IF p_new_status IN ('confirmed','ready_for_dispatch','shipped','delivered','cancelled') THEN
    PERFORM public.queue_notification(v_order.id, 'status_' || p_new_status,
      coalesce(v_order.guest_email, v_order.email), 'FabluX order ' || v_order.reference || ' - ' || v_label,
      format('Order %s: %s. Track it: https://fablux.pages.dev/track.html?ref=%s&token=%s',
             v_order.reference, v_label, v_order.reference, v_order.tracking_token));
  END IF;
  IF p_new_status IN ('confirmed','cancelled') THEN
    PERFORM public.queue_notification(v_order.id, 'admin_' || p_new_status, 'ujunwaigbani@gmail.com',
      'FabluX order ' || v_order.reference || ' - ' || v_label,
      format('Order %s is now %s.', v_order.reference, p_new_status));
    PERFORM public.queue_notification(v_order.id, 'admin_' || p_new_status, 'igbanichiobiebere@gmail.com',
      'FabluX order ' || v_order.reference || ' - ' || v_label,
      format('Order %s is now %s.', v_order.reference, p_new_status));
  END IF;

  RETURN jsonb_build_object('reference', v_order.reference, 'status', p_new_status,
    'status_updated_at', iso_now());
END $$;

-- ----------------------------------------------------------------------------
-- 6. Housekeeping: cron and pg_net bookkeeping tables otherwise grow forever.
-- ----------------------------------------------------------------------------
SELECT cron.schedule('fx-prune-cron-log', '15 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '7 days'$$);

SELECT cron.schedule('fx-prune-http-responses', '25 3 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - INTERVAL '7 days'$$);
