-- ============================================================================
-- FabluX.U.Design — SECURITY HARDENING (Supabase / PostgreSQL)
-- Run AFTER: setup-supabase.sql, setup-rls.sql, setup-fulfilment.sql,
--            setup-promo-codes.sql, setup-product-images.sql,
--            setup-admin-bootstrap.sql
-- Safe to run repeatedly (idempotent).
--
-- What this closes:
--   1. settings were world-readable (any anon key could read every row)
--   2. public write endpoints (contact / newsletter) had no rate limit or
--      consent record
--   3. no customer self-service data deletion
--   4. missing indexes on hot query paths
--   5. anon role held table privileges it never needs
--   6. Storage accepted any image/* content type
--   7. missing columns for consent / unsubscribe / account deletion
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns for consent, unsubscribe and account deletion
-- ----------------------------------------------------------------------------
ALTER TABLE public.users                  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.contacts               ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE public.contacts               ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS source TEXT;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS on every application table (defence in depth)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','addresses','orders','order_items','reviews','returns','products',
    'settings','contacts','newsletter_subscribers','payment_transactions',
    'password_resets','sessions','order_events','audit_log','notifications',
    'promo_codes'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. settings: only an explicit public whitelist is readable by shoppers.
--    (create_order() is SECURITY DEFINER, so it still reads everything.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS settings_select ON public.settings;
DROP POLICY IF EXISTS settings_public_read ON public.settings;
CREATE POLICY settings_public_read ON public.settings FOR SELECT TO anon, authenticated
  USING (key IN (
    'delivery_fee_default','delivery_fee_express_surcharge',
    'store_name','store_contact','store_email','store_address',
    'email_enabled'
  ));

-- ----------------------------------------------------------------------------
-- 4. Least privilege: anon never needs the sensitive tables directly.
--    Guest checkout goes through the SECURITY DEFINER create_order() RPC.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.users                  FROM anon;
REVOKE ALL ON public.addresses              FROM anon;
REVOKE ALL ON public.orders                 FROM anon;
REVOKE ALL ON public.order_items            FROM anon;
REVOKE ALL ON public.order_events           FROM anon;
REVOKE ALL ON public.payment_transactions   FROM anon;
REVOKE ALL ON public.returns                FROM anon;
REVOKE ALL ON public.audit_log              FROM anon;
REVOKE ALL ON public.notifications          FROM anon;
REVOKE ALL ON public.password_resets        FROM anon;
REVOKE ALL ON public.sessions               FROM anon;

-- Public forms may ONLY be written through the rate-limited RPCs below.
-- Without this, a bot could bypass the rate limit by POSTing to the table.
REVOKE INSERT ON public.contacts                FROM anon, authenticated;
REVOKE INSERT ON public.newsletter_subscribers  FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Rate limiting (server-side, survives client tampering)
--    A bucket is a named action (e.g. 'contact'); subject is usually email.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id         BIGSERIAL PRIMARY KEY,
  bucket     TEXT NOT NULL,
  subject    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON public.rate_limit_hits (bucket, subject, created_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;  -- definer-only

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_bucket TEXT, p_subject TEXT, p_max INTEGER, p_window_seconds INTEGER)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF coalesce(p_bucket,'') = '' OR coalesce(p_subject,'') = '' THEN RETURN false; END IF;

  -- opportunistic cleanup of this bucket's expired rows
  DELETE FROM public.rate_limit_hits
   WHERE bucket = p_bucket
     AND created_at < now() - make_interval(secs => greatest(p_window_seconds, 1) * 2);

  SELECT count(*) INTO v_count
    FROM public.rate_limit_hits
   WHERE bucket = p_bucket AND subject = lower(p_subject)
     AND created_at >= now() - make_interval(secs => greatest(p_window_seconds, 1));

  IF v_count >= greatest(p_max, 1) THEN RETURN false; END IF;

  INSERT INTO public.rate_limit_hits (bucket, subject) VALUES (p_bucket, lower(p_subject));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Public form endpoints (contact + newsletter) as rate-limited RPCs
--    Honeypot: a hidden field real people never fill. If filled, we pretend
--    success and store nothing, so bots get no feedback.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_contact(
  p_name TEXT, p_email TEXT, p_subject TEXT, p_message TEXT,
  p_consent BOOLEAN, p_honeypot TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email,'')));
BEGIN
  IF coalesce(p_honeypot,'') <> '' THEN
    RETURN jsonb_build_object('ok', true);            -- silently drop bots
  END IF;
  IF v_email = '' OR position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF coalesce(btrim(p_message),'') = '' THEN
    RAISE EXCEPTION 'Please write a message.';
  END IF;
  IF length(p_message) > 4000 THEN
    RAISE EXCEPTION 'Message is too long.';
  END IF;
  IF NOT coalesce(p_consent, false) THEN
    RAISE EXCEPTION 'Please agree to the privacy policy before sending.';
  END IF;
  IF NOT public.rate_limit_hit('contact', v_email, 5, 3600) THEN
    RAISE EXCEPTION 'Too many messages. Please try again later.';
  END IF;

  INSERT INTO public.contacts (id, name, email, subject, message, created_at, consent_at, user_agent)
  VALUES ('msg_' || substr(md5(random()::text || clock_timestamp()::text),1,16),
          left(coalesce(nullif(btrim(p_name),''),'Guest'),120), v_email,
          left(coalesce(nullif(btrim(p_subject),''),'Enquiry'),160),
          left(p_message,4000), now()::text, now(), left(coalesce(p_user_agent,''),400));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_contact(TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contact(TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(
  p_email TEXT, p_consent BOOLEAN, p_honeypot TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email,'')));
BEGIN
  IF coalesce(p_honeypot,'') <> '' THEN RETURN jsonb_build_object('ok', true); END IF;
  IF v_email = '' OR position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF NOT coalesce(p_consent, false) THEN
    RAISE EXCEPTION 'Please agree to the privacy policy before subscribing.';
  END IF;
  IF NOT public.rate_limit_hit('newsletter', v_email, 3, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  INSERT INTO public.newsletter_subscribers (id, email, created_at, consent_at, unsubscribed_at, source)
  VALUES ('sub_' || substr(md5(random()::text || clock_timestamp()::text),1,16),
          v_email, now()::text, now(), NULL, 'site')
  ON CONFLICT (email) DO UPDATE
    SET consent_at = now(), unsubscribed_at = NULL;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.subscribe_newsletter(TEXT,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT,BOOLEAN,TEXT) TO anon, authenticated;

-- One-click unsubscribe (token-free, rate limited so it cannot be used to spam)
CREATE OR REPLACE FUNCTION public.unsubscribe_newsletter(p_email TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email,'')));
BEGIN
  IF v_email = '' OR position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF NOT public.rate_limit_hit('unsubscribe', v_email, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  UPDATE public.newsletter_subscribers SET unsubscribed_at = now() WHERE email = v_email;
  RETURN jsonb_build_object('ok', true);   -- always ok: never reveal membership
END $$;
REVOKE ALL ON FUNCTION public.unsubscribe_newsletter(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Customer self-service data deletion (GDPR / NDPR style)
--    Deletes personal rows, anonymises orders that must be retained for tax,
--    and marks the profile deleted. Supabase Auth user removal is done by an
--    administrator/Edge Function using the service role.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid TEXT := auth.uid()::text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;

  DELETE FROM public.addresses WHERE user_id = v_uid;
  DELETE FROM public.reviews   WHERE user_id = v_uid;
  UPDATE public.returns SET details = '[deleted at customer request]' WHERE user_id = v_uid;

  UPDATE public.orders SET
    customer_name = 'Deleted customer', email = 'deleted@invalid.local',
    guest_email = NULL, phone = '', address = '', city = '', state = '',
    landmark = NULL, instructions = NULL, notes = NULL
   WHERE user_id = v_uid;

  UPDATE public.newsletter_subscribers s
     SET unsubscribed_at = now()
   WHERE lower(s.email) = (SELECT lower(email) FROM public.users WHERE id = v_uid);

  UPDATE public.users SET
    name = 'Deleted customer', email = 'deleted+' || left(md5(v_uid),8) || '@invalid.local',
    phone = NULL, deleted_at = now(), updated_at = now()
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.delete_my_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Hot-path indexes (all IF NOT EXISTS)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_user_created     ON public.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_guest_email      ON public.orders(guest_email);
CREATE INDEX IF NOT EXISTS idx_orders_reference        ON public.orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_status_created   ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order       ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addresses_user          ON public.addresses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_user            ON public.returns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_active         ON public.products(active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock          ON public.products(stock);
CREATE INDEX IF NOT EXISTS idx_promos_active           ON public.promo_codes(active);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON public.notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created           ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_created        ON public.contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_email        ON public.newsletter_subscribers(email);

-- ----------------------------------------------------------------------------
-- 9. Storage: only real picture formats, still max 5 MB
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images','product-images', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- ----------------------------------------------------------------------------
-- 10. Verification helper (run manually): every table should show rowsecurity=t
-- ----------------------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
