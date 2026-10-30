-- FabluX: administrator allow-list and profile-row provisioning.
--
-- Why this file exists:
--   1. Google/OAuth sign-in created auth accounts but never the matching
--      public.users row, so is_admin() saw nothing and the owner was treated
--      as a customer. A trigger on auth.users now mirrors every account.
--   2. is_admin() trusted public.users.email, which a signed-in customer can
--      update (RLS allows editing their own row). Any user could point their
--      profile at an allow-listed address and become an administrator.
--      is_admin() now also requires the address in the verified JWT.
--   3. public.users.email is locked to the real auth.users address, so it can
--      only ever mirror what Supabase Auth holds.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Approved administrators
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allowed_admin_email(p_email text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS
$$ SELECT lower(coalesce(p_email,'')) IN (
     'fabluxdesigns@gmail.com',
     'ujuigbani@gmail.com',
     'igbanichiobiebere@gmail.com'
   ) $$;

-- ---------------------------------------------------------------------------
-- 2. Admin test: role + allow-list + the address actually signed in with
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u.role = 'admin'
        AND public.allowed_admin_email(u.email)
        AND lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))
   ) $$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The profile email may only mirror the address Supabase Auth owns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_user_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_auth_email text;
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    SELECT lower(a.email) INTO v_auth_email FROM auth.users a WHERE a.id::text = OLD.id;
    IF v_auth_email IS NULL OR lower(NEW.email) IS DISTINCT FROM v_auth_email THEN
      NEW.email := OLD.email;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_0_lock_user_email ON public.users;
CREATE TRIGGER trg_0_lock_user_email
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.lock_user_email();

-- ---------------------------------------------------------------------------
-- 4. Every auth account gets exactly one profile row, with the right role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.users (id, email, password_hash, name, phone, role, created_at, updated_at)
  VALUES (
    NEW.id::text,
    lower(NEW.email),
    'managed-by-supabase-auth',
    coalesce(nullif(NEW.raw_user_meta_data->>'name',''),
             nullif(NEW.raw_user_meta_data->>'full_name',''),
             NEW.email),
    nullif(NEW.raw_user_meta_data->>'phone',''),
    CASE WHEN public.allowed_admin_email(NEW.email) THEN 'admin' ELSE 'customer' END,
    to_char(coalesce(NEW.created_at, now()) AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = excluded.email,
        role  = CASE WHEN public.allowed_admin_email(excluded.email) THEN 'admin' ELSE 'customer' END,
        updated_at = excluded.updated_at;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_sync_auth_user ON auth.users;
CREATE TRIGGER trg_sync_auth_user
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user();

-- ---------------------------------------------------------------------------
-- 5. Backfill accounts that exist in Auth but not in public.users
-- ---------------------------------------------------------------------------
INSERT INTO public.users (id, email, password_hash, name, phone, role, created_at, updated_at)
SELECT a.id::text,
       lower(a.email),
       'managed-by-supabase-auth',
       coalesce(nullif(a.raw_user_meta_data->>'name',''),
                nullif(a.raw_user_meta_data->>'full_name',''),
                a.email),
       nullif(a.raw_user_meta_data->>'phone',''),
       CASE WHEN public.allowed_admin_email(a.email) THEN 'admin' ELSE 'customer' END,
       to_char(coalesce(a.created_at, now()) AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  FROM auth.users a
 WHERE a.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Re-derive every existing role from the new allow-list
--    (the offered-removed address becomes an ordinary customer)
-- ---------------------------------------------------------------------------
UPDATE public.users u
   SET role = CASE WHEN public.allowed_admin_email(u.email) THEN 'admin' ELSE 'customer' END,
       updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 WHERE u.role IS DISTINCT FROM
       CASE WHEN public.allowed_admin_email(u.email) THEN 'admin' ELSE 'customer' END;
