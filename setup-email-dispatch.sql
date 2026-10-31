-- FabluX: deliver the notification outbox through Brevo.
--
-- queue_notification() has always written rows to public.notifications, but
-- nothing ever sent them: the rows sat at 'queued' forever, which is why no
-- welcome mail or order update ever reached a customer.
--
-- This file adds the missing sender:
--   * the Brevo API key lives in Supabase Vault (never in git, never in a table
--     the anon key can read);
--   * dispatch_emails() posts queued rows to Brevo's transactional API;
--   * pg_cron calls it every minute;
--   * new customers get a welcome mail.
--
-- Prerequisites (run once, already applied to the live project):
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--   select vault.create_secret('<brevo-api-key>', 'brevo_api_key');
--
-- Safe to re-run. Secrets are NOT in this file on purpose.

-- ---------------------------------------------------------------------------
-- 1. Sender identity (public read is fine: it is printed on every mail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_settings (
  id        int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  from_email text NOT NULL,
  from_name  text NOT NULL DEFAULT 'FabluX.U.Design',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy: only SECURITY DEFINER code and service_role read it.

INSERT INTO public.email_settings (id, from_email, from_name)
VALUES (1, 'igbanichiobiebere@gmail.com', 'FabluX.U.Design')
ON CONFLICT (id) DO UPDATE
  SET from_email = excluded.from_email,
      from_name  = excluded.from_name,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. The sender itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_emails(p_limit int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_key  text;
  v_from text;
  v_name text;
  r      record;
  n      int := 0;
BEGIN
  IF coalesce((SELECT value FROM public.settings WHERE key = 'email_enabled'), 'false') <> 'true' THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'brevo_api_key' LIMIT 1;
  SELECT from_email, from_name INTO v_from, v_name FROM public.email_settings WHERE id = 1;
  IF v_key IS NULL OR v_from IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, recipient, subject, body
      FROM public.notifications
     WHERE channel = 'email'
       AND status = 'queued'
       AND attempts < 4
       AND recipient <> ''
     ORDER BY created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.brevo.com/v3/smtp/email',
        headers := jsonb_build_object('api-key', v_key, 'content-type', 'application/json'),
        body    := jsonb_build_object(
          'sender',  jsonb_build_object('name', v_name, 'email', v_from),
          'to',      jsonb_build_array(jsonb_build_object('email', r.recipient)),
          'subject', coalesce(nullif(r.subject, ''), 'FabluX.U.Design'),
          'textContent', coalesce(r.body, '')
        )
      );
      -- ponytail: marked sent on request dispatch, not on Brevo's reply.
      -- net._http_response holds the real status for 6h; add a verification pass
      -- if bounced mail ever needs to be surfaced to the admin.
      UPDATE public.notifications
         SET status = 'sent', sent_at = now(), attempts = attempts + 1, error = NULL
       WHERE id = r.id;
      n := n + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.notifications
         SET attempts = attempts + 1, error = left(SQLERRM, 300)
       WHERE id = r.id;
    END;
  END LOOP;

  RETURN n;
END $fn$;

REVOKE ALL ON FUNCTION public.dispatch_emails(int) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Every minute
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('fx-email-dispatch')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fx-email-dispatch');

SELECT cron.schedule('fx-email-dispatch', '* * * * *', $cron$ SELECT public.dispatch_emails(20) $cron$);

-- ---------------------------------------------------------------------------
-- 4. Welcome mail for every new customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_welcome_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.queue_notification(
    NULL,
    'welcome',
    NEW.email,
    'Welcome to FabluX.U.Design',
    format(
      E'Hi %s,\n\nWelcome to FabluX.U.Design — premium clothing, shoes and accessories.\n\nBrowse the shop: https://fablux.pages.dev/shop.html\n\nQuestions? Just reply to this email.\n\n— FabluX.U.Design',
      coalesce(nullif(split_part(NEW.name, ' ', 1), ''), 'there')
    )
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_welcome_email ON public.users;
CREATE TRIGGER trg_welcome_email
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.queue_welcome_email();

-- ---------------------------------------------------------------------------
-- 5. Switch the outbox on (queue_notification reads this flag)
-- ---------------------------------------------------------------------------
INSERT INTO public.settings (key, value, updated_at)
VALUES ('email_enabled', 'true', now())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
