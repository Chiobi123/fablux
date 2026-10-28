-- ============================================================================
-- FabluX.U.Design — product detail fields + product write hardening
--
-- Products are the single source of truth for name, price, category, image,
-- stock and descriptive copy. Customers may read live products; only admins
-- may create, edit or delete them. Order totals are recalculated inside
-- create_order() from public.products, never from the browser.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS material    text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS features    jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Sanity constraints (guarded so this script is idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_nonnegative') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_price_nonnegative CHECK (price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonnegative') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0);
  END IF;
END $$;

-- The shop reads live products ordered by id.
CREATE INDEX IF NOT EXISTS products_active_id_idx ON public.products (active, id);

-- Defense in depth: anonymous visitors can never write products, even if a
-- future policy is added by mistake.
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;

-- Re-assert the read/write policies (idempotent).
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO anon, authenticated
  USING (active = 1 OR is_admin());

DROP POLICY IF EXISTS products_admin ON public.products;
CREATE POLICY products_admin ON public.products FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Keep `features` a JSON array even if an old client sends a string.
CREATE OR REPLACE FUNCTION public.normalize_product_features() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.features IS NULL OR jsonb_typeof(NEW.features) <> 'array' THEN
    NEW.features := '[]'::jsonb;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_features_norm ON public.products;
CREATE TRIGGER products_features_norm
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.normalize_product_features();
