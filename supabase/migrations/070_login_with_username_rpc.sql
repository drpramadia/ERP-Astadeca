-- RPC: login dengan username (tanpa email)
-- Menggunakan SECURITY DEFINER agar bisa baca auth.users meskipun caller pakai anon key
CREATE OR REPLACE FUNCTION login_with_username(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_sign_in JSON;
BEGIN
  -- Cari user_id dari username di profiles
  SELECT id INTO v_user_id
  FROM profiles
  WHERE username = p_username
    AND (is_active IS TRUE OR is_active IS NULL);

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Username tidak ditemukan atau tidak aktif.'
    );
  END IF;

  -- Ambil email dari auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Akun tidak memiliki email. Hubungi admin.'
    );
  END IF;

  -- Login dengan email via REST API (karena RPC tidak bisa invoke auth)
  -- Kembalikan email agar frontend bisa signInWithPassword
  RETURN json_build_object(
    'success', true,
    'email', v_email,
    'user_id', v_user_id
  );
END;
$$;

COMMENT ON FUNCTION login_with_username IS 'Lookup email dari username; return email untuk login. Panggil supabase.auth.signInWithPassword secara client-side.';
