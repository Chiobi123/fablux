-- ============================================================
-- Product pictures (Supabase Storage)
-- One public bucket holds the pictures administrators upload
-- from the console. Reads are public so the shop can show them;
-- writes are limited to the two approved administrator addresses
-- (public.is_admin() comes from setup-fulfilment.sql /
--  setup-admin-bootstrap.sql).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

DROP POLICY IF EXISTS "product images: public read" ON storage.objects;
CREATE POLICY "product images: public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product images: admins upload" ON storage.objects;
CREATE POLICY "product images: admins upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "product images: admins update" ON storage.objects;
CREATE POLICY "product images: admins update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "product images: admins delete" ON storage.objects;
CREATE POLICY "product images: admins delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin());
