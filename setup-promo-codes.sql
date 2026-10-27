-- ============================================================
-- Promo / discount codes
--   • promo_codes is written only by the approved administrators
--     (public.is_admin() from setup-fulfilment.sql).
--   • shoppers never read the table: they call validate_promo(),
--     a SECURITY DEFINER function that answers valid/not valid
--     and the discount, and create_order() re-checks the code
--     inside the database before a total is written.
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code TEXT;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code         TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  value        INTEGER NOT NULL CHECK (value > 0),
  min_subtotal BIGINT NOT NULL DEFAULT 0,   -- smallest order the code works on
  max_uses     INTEGER NOT NULL DEFAULT 0,  -- 0 = unlimited
  used_count   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promo_admin ON public.promo_codes;
CREATE POLICY promo_admin ON public.promo_codes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_promo(p_code TEXT, p_subtotal BIGINT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          public.promo_codes%ROWTYPE;
  v_discount bigint := 0;
BEGIN
  IF coalesce(trim(p_code), '') = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Enter a promo code.');
  END IF;

  SELECT * INTO c FROM public.promo_codes
   WHERE upper(code) = upper(trim(p_code));

  IF NOT FOUND OR coalesce(c.active, 0) <> 1 THEN
    RETURN jsonb_build_object('valid', false, 'message', 'That promo code is not recognised.');
  END IF;
  IF coalesce(c.max_uses, 0) > 0 AND c.used_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'That promo code has been used up.');
  END IF;
  IF coalesce(p_subtotal, 0) < coalesce(c.min_subtotal, 0) THEN
    RETURN jsonb_build_object('valid', false, 'message',
      'This code needs a minimum order of NGN ' || c.min_subtotal || '.');
  END IF;

  v_discount := CASE WHEN c.kind = 'percent'
                     THEN (p_subtotal * c.value / 100)::bigint
                     ELSE c.value::bigint END;
  IF v_discount > p_subtotal THEN v_discount := p_subtotal; END IF;

  RETURN jsonb_build_object('valid', true, 'code', c.code, 'kind', c.kind,
                            'value', c.value, 'discount', v_discount, 'message', '');
END $$;

GRANT EXECUTE ON FUNCTION public.validate_promo(TEXT, BIGINT) TO anon, authenticated;
