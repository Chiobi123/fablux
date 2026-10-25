-- FabluX: grants + row level security for Supabase (PostgREST) access

-- 1. Grants (tables were created by the pooler role, so default privileges did not apply)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 2. Admin helper (runs as owner, so it bypasses RLS on users)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'admin') $fn$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 3. Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- users
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (id = auth.uid()::text OR is_admin());
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text AND role = 'customer');
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text AND role = 'customer');
DROP POLICY IF EXISTS users_admin ON users;
CREATE POLICY users_admin ON users FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- addresses
DROP POLICY IF EXISTS addresses_own ON addresses;
CREATE POLICY addresses_own ON addresses FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS addresses_admin ON addresses;
CREATE POLICY addresses_admin ON addresses FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- orders
DROP POLICY IF EXISTS orders_own ON orders;
CREATE POLICY orders_own ON orders FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS orders_admin ON orders;
CREATE POLICY orders_admin ON orders FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- order_items
DROP POLICY IF EXISTS order_items_own ON order_items;
CREATE POLICY order_items_own ON order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()::text));
DROP POLICY IF EXISTS order_items_admin ON order_items;
CREATE POLICY order_items_admin ON order_items FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- reviews
DROP POLICY IF EXISTS reviews_select ON reviews;
CREATE POLICY reviews_select ON reviews FOR SELECT TO anon, authenticated
  USING (status = 'published' OR is_admin());
DROP POLICY IF EXISTS reviews_insert ON reviews;
CREATE POLICY reviews_insert ON reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS reviews_admin ON reviews;
CREATE POLICY reviews_admin ON reviews FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- returns
DROP POLICY IF EXISTS returns_own ON returns;
CREATE POLICY returns_own ON returns FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS returns_admin ON returns;
CREATE POLICY returns_admin ON returns FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- products
DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products FOR SELECT TO anon, authenticated
  USING (active = 1 OR is_admin());
DROP POLICY IF EXISTS products_admin ON products;
CREATE POLICY products_admin ON products FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- settings
DROP POLICY IF EXISTS settings_select ON settings;
CREATE POLICY settings_select ON settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS settings_admin ON settings;
CREATE POLICY settings_admin ON settings FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- contacts / newsletter (public can write, only admin can read)
DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS contacts_admin ON contacts;
CREATE POLICY contacts_admin ON contacts FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS newsletter_insert ON newsletter_subscribers;
CREATE POLICY newsletter_insert ON newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS newsletter_admin ON newsletter_subscribers;
CREATE POLICY newsletter_admin ON newsletter_subscribers FOR SELECT TO authenticated USING (is_admin());

-- payment_transactions
DROP POLICY IF EXISTS payments_own ON payment_transactions;
CREATE POLICY payments_own ON payment_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = payment_transactions.order_id AND o.user_id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = payment_transactions.order_id AND o.user_id = auth.uid()::text));
DROP POLICY IF EXISTS payments_admin ON payment_transactions;
CREATE POLICY payments_admin ON payment_transactions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- password_resets / sessions stay locked (Supabase Auth handles sessions)
