-- ============================================================================
-- FabluX.U.Design — Order & Delivery Fulfilment layer (Supabase / PostgreSQL)
-- Extends setup-supabase.sql + setup-rls.sql.  Safe to run repeatedly.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes() for tracking tokens

-- pgcrypto lives in the "extensions" schema on Supabase, while the security
-- DEFINER functions below run with search_path = public.  Expose the one helper
-- we need from public so token generation always resolves.
CREATE OR REPLACE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea
LANGUAGE sql VOLATILE AS
$$ SELECT extensions.gen_random_bytes(n) $$;

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_now() RETURNS text
LANGUAGE sql IMMUTABLE AS
$$ SELECT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- ----------------------------------------------------------------------------
-- 1. Orders: fulfilment columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reference TEXT UNIQUE;
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;   -- guest checkout
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24),'hex');
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_tracking TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatched_at TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_updated_at TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_updated_at TEXT;

UPDATE public.orders SET status = 'pending_payment' WHERE status IN ('pending','placed') AND reference IS NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_payment','payment_confirmed','confirmed','processing',
  'ready_for_dispatch','shipped','delivered','cancelled'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
  'pending','successful','failed','refunded'));

CREATE SEQUENCE IF NOT EXISTS public.order_reference_seq START 1001;
CREATE INDEX IF NOT EXISTS idx_orders_reference ON public.orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_guest_email ON public.orders(guest_email);

-- ----------------------------------------------------------------------------
-- 2. Order events (customer-visible timeline), audit log, notification outbox
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  label TEXT NOT NULL,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events(order_id, created_at);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log(entity, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT,
  event TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications
  ON public.notifications (coalesce(order_id,'-'), event, channel, recipient);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status, created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_events_admin ON public.order_events;
CREATE POLICY order_events_admin ON public.order_events FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS order_events_own ON public.order_events;
CREATE POLICY order_events_own ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND o.user_id = auth.uid()::text));

DROP POLICY IF EXISTS audit_admin ON public.audit_log;
CREATE POLICY audit_admin ON public.audit_log FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS notifications_admin ON public.notifications;
CREATE POLICY notifications_admin ON public.notifications FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

GRANT SELECT ON public.order_events, public.audit_log, public.notifications TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Configurable delivery pricing + store identity (admin editable)
-- ----------------------------------------------------------------------------
INSERT INTO public.settings (key, value, updated_at) VALUES
  ('delivery_fee_default','2500', iso_now()),
  ('delivery_fee_express_surcharge','1500', iso_now()),
  ('store_name','FabluX.U.Design', iso_now()),
  ('store_contact','+234 XXX XXX XXXX', iso_now()),
  ('store_email','info@fabluxudesign.com', iso_now()),
  ('store_address','Nigeria', iso_now()),
  ('email_enabled','false', iso_now())
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Trust boundary: only these two people may ever be administrators
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allowed_admin_email(p_email text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS
$$ SELECT lower(coalesce(p_email,'')) IN ('ujunwaigbani@gmail.com','igbanichiobiebere@gmail.com') $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.users
      WHERE id = auth.uid()::text AND role = 'admin' AND allowed_admin_email(email)) $$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$ BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Orders become write-protected: everything goes through the functions below
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Notification outbox (retryable; does NOT block or destroy order records)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_notification(
  p_order_id text, p_event text, p_recipient text, p_subject text, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled text;
BEGIN
  SELECT value INTO v_enabled FROM public.settings WHERE key = 'email_enabled';
  INSERT INTO public.notifications (order_id, event, channel, recipient, subject, body, status, error)
  VALUES (p_order_id, p_event, 'email', lower(p_recipient), p_subject, p_body,
          CASE WHEN v_enabled = 'true' THEN 'queued' ELSE 'pending' END,
          CASE WHEN v_enabled = 'true' THEN NULL
               ELSE 'Email delivery requires SMTP configuration (not yet sent).' END)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.admin_alert_body(p_ref text, p_total bigint,
  p_payment text, p_status text) RETURNS text
LANGUAGE sql IMMUTABLE AS
$$ SELECT format(E'New FabluX order received.\n\nOrder reference: %s\nTotal: NGN %s\nPayment status: %s\nOrder status: %s\n\nOpen the protected order page:\nhttps://fablux.pages.dev/admin.html?order=%s',
                 p_ref, p_total, p_payment, p_status, p_ref) $$;

-- ----------------------------------------------------------------------------
-- 7. CREATE ORDER — server-side validation, pricing, stock, idempotency
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_items            jsonb,     -- [{"product_id":"1","quantity":2}]
  p_name             text,
  p_phone            text,
  p_address          text,
  p_city             text,
  p_state            text,
  p_delivery_method  text DEFAULT 'standard',
  p_payment_method   text DEFAULT 'pay-on-delivery',
  p_guest_email      text DEFAULT NULL,
  p_landmark         text DEFAULT NULL,
  p_instructions     text DEFAULT NULL,
  p_promo            text DEFAULT NULL,
  p_idempotency_key  text DEFAULT NULL)
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

  -- ---- line items: merge duplicates, lock rows, price from DB ------------
  FOR v_pid, v_qty IN
    SELECT coalesce(e->>'product_id',''),
           sum(greatest(1, least(99, coalesce((e->>'quantity')::numeric, 1))))
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
-- 8. Tracking (owner or unguessable token — never by guessing an order id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_order(p_ref text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders
   WHERE reference = p_ref AND tracking_token = lower(coalesce(p_token,''));
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found. Check your reference and tracking link.'; END IF;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'reference', v_order.reference, 'status', v_order.status,
      'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
      'delivery_method', v_order.delivery_method, 'subtotal', v_order.subtotal,
      'delivery_fee', v_order.delivery_fee, 'discount', v_order.discount, 'total', v_order.total,
      'currency', v_order.currency, 'customer_name', v_order.customer_name,
      'city', v_order.city, 'state', v_order.state, 'address', v_order.address,
      'courier', v_order.courier, 'courier_tracking', v_order.courier_tracking,
      'dispatched_at', v_order.dispatched_at, 'delivered_at', v_order.delivered_at,
      'created_at', v_order.created_at, 'status_updated_at', v_order.status_updated_at),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', i.name, 'price', i.price, 'quantity', i.quantity, 'line_total', i.price * i.quantity)
        ORDER BY i.id) FROM public.order_items i WHERE i.order_id = v_order.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'event', e.event, 'label', e.label, 'created_at', e.created_at) ORDER BY e.created_at)
        FROM public.order_events e WHERE e.order_id = v_order.id), '[]'::jsonb));
END $$;

-- ----------------------------------------------------------------------------
-- 9. Admin operations — validated on the server, audited, never client-side
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit(p_action text, p_entity text, p_entity_id text, p_detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, actor_email, action, entity, entity_id, detail)
  VALUES (auth.uid()::text,
          coalesce((SELECT email FROM public.users WHERE id = auth.uid()::text),'system'),
          p_action, p_entity, p_entity_id, coalesce(p_detail,'{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_order_status(p_ref text, p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      RAISE EXCEPTION 'Invalid status change: % → %.', v_from, p_new_status; END IF;
  END IF;

  UPDATE public.orders
     SET status = p_new_status, status_updated_at = iso_now(), updated_at = iso_now(),
         cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN iso_now() ELSE cancelled_at END,
         delivered_at = CASE WHEN p_new_status = 'delivered' THEN iso_now() ELSE delivered_at END
   WHERE reference = p_ref;

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
  VALUES (v_order.id, p_new_status, v_label, coalesce((SELECT email FROM public.users WHERE id = auth.uid()::text),'system'));

  PERFORM public.audit('order_status_change','orders',p_ref,
    jsonb_build_object('from', v_from, 'to', p_new_status));

  IF p_new_status IN ('confirmed','ready_for_dispatch','shipped','delivered','cancelled') THEN
    PERFORM public.queue_notification(v_order.id, 'status_' || p_new_status,
      coalesce(v_order.guest_email, v_order.email), 'FabluX order ' || v_order.reference || ' — ' || v_label,
      format('Order %s: %s. Track it: https://fablux.pages.dev/track.html?ref=%s&token=%s',
             v_order.reference, v_label, v_order.reference, v_order.tracking_token));
  END IF;
  IF p_new_status IN ('confirmed','cancelled') THEN
    PERFORM public.queue_notification(v_order.id, 'admin_' || p_new_status, 'ujunwaigbani@gmail.com',
      'FabluX order ' || v_order.reference || ' — ' || v_label,
      format('Order %s is now %s.', v_order.reference, p_new_status));
    PERFORM public.queue_notification(v_order.id, 'admin_' || p_new_status, 'igbanichiobiebere@gmail.com',
      'FabluX order ' || v_order.reference || ' — ' || v_label,
      format('Order %s is now %s.', v_order.reference, p_new_status));
  END IF;

  RETURN jsonb_build_object('reference', v_order.reference, 'status', p_new_status,
    'status_updated_at', iso_now());
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_payment_status(p_ref text, p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_from text;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE reference = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  v_from := v_order.payment_status;
  IF p_new_status NOT IN ('pending','successful','failed','refunded') THEN
    RAISE EXCEPTION 'Invalid payment status.'; END IF;

  -- Card payments may only be confirmed by server-side payment verification,
  -- never by an administrator flipping a field.
  IF p_new_status = 'successful' AND v_order.payment_method = 'card' THEN
    RAISE EXCEPTION 'Card payments must be confirmed by payment-provider verification, not manually.'; END IF;
  IF v_from = 'successful' AND p_new_status = 'failed' THEN
    RAISE EXCEPTION 'Use a refund instead of reversing a successful payment.'; END IF;

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
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'ujunwaigbani@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
    PERFORM public.queue_notification(v_order.id, 'admin_payment', 'igbanichiobiebere@gmail.com',
      'Payment confirmed — ' || v_order.reference,
      format('Payment confirmed for order %s (NGN %s).', v_order.reference, v_order.total));
  END IF;

  RETURN jsonb_build_object('reference', v_order.reference, 'payment_status', p_new_status);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_courier(
  p_ref text, p_courier text, p_tracking text, p_dispatched_at text, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE reference = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  UPDATE public.orders SET
    courier = nullif(trim(coalesce(p_courier,'')),''),
    courier_tracking = nullif(trim(coalesce(p_tracking,'')),''),
    dispatched_at = nullif(coalesce(p_dispatched_at, dispatched_at),''),
    notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), notes),
    updated_at = iso_now()
   WHERE reference = p_ref;

  PERFORM public.audit('courier_update','orders',p_ref, jsonb_build_object(
    'courier', p_courier, 'tracking', p_tracking, 'dispatched_at', p_dispatched_at));

  IF coalesce(p_courier,'') <> '' THEN
    INSERT INTO public.order_events (order_id, event, label, actor)
    VALUES (v_order.id, 'courier_assigned', 'Courier: ' || trim(p_courier),
            coalesce((SELECT email FROM public.users WHERE id = auth.uid()::text),'system'));
  END IF;
  RETURN jsonb_build_object('reference', v_order.reference, 'courier', p_courier,
    'courier_tracking', p_tracking);
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key text, p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_key NOT IN ('delivery_fee_default','delivery_fee_express_surcharge','marketplace_enabled',
                   'store_name','store_contact','store_email','store_address','email_enabled') THEN
    RAISE EXCEPTION 'This setting cannot be changed.'; END IF;
  IF p_key = 'marketplace_enabled' AND p_value NOT IN ('0','1') THEN
    RAISE EXCEPTION 'Invalid value.'; END IF;
  IF p_key LIKE 'delivery_fee%' AND (p_value !~ '^[0-9]{1,7}$') THEN
    RAISE EXCEPTION 'Delivery charge must be a whole amount in Naira.'; END IF;
  IF p_key = 'email_enabled' AND p_value NOT IN ('true','false') THEN
    RAISE EXCEPTION 'Invalid value.'; END IF;

  INSERT INTO public.settings (key, value, updated_at)
  VALUES (p_key, p_value, iso_now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  PERFORM public.audit('setting_update','settings',p_key, jsonb_build_object('value', p_value));
  RETURN jsonb_build_object('key', p_key, 'value', p_value);
END $$;

-- Customers may only read their own order items through orders they can see.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
