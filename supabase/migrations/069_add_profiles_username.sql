-- Add username column to profiles for login
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
COMMENT ON COLUMN profiles.username IS 'Username untuk login, opsional.';

-- Set username from email prefix for users who don't have one yet
UPDATE profiles
SET username = split_part(auth.users.email, '@', 1)
FROM auth.users
WHERE profiles.id = auth.users.id
  AND profiles.username IS NULL;

-- Update auth.users metadata untuk mendukung login identifier
-- NOTE: Supabase auth signInWithPassword secara default menerima email.
-- Untuk login dengan username, kita perlu lookup email dari username lalu sign in.
-- Tidak ada perubahan pada auth.users karena email tetap jadi account identifier.
