-- FabluX: no password and no admin flag is stored anywhere in this repo.
-- Whoever registers with an approved address becomes the administrator;
-- every other account is a customer. Enforced by the database itself, so a
-- login can only ever be created by the person signing up.

CREATE OR REPLACE FUNCTION public.apply_admin_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.allowed_admin_email(NEW.email) THEN
    NEW.role := 'admin';
  ELSE
    NEW.role := 'customer';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_apply_admin_role ON public.users;
CREATE TRIGGER trg_apply_admin_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.apply_admin_role();

-- the approved addresses must be able to hold the admin role in their own row
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text AND (role = 'customer' OR allowed_admin_email(email)));

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text AND (role = 'customer' OR allowed_admin_email(email)));
