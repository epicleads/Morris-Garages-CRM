-- ============================================================
-- TEST USERS SETUP SCRIPT
-- ============================================================
-- Run this in Supabase SQL Editor to create test users
-- 
-- IMPORTANT: The password hashes below are PLACEHOLDERS!
-- You MUST generate real bcrypt hashes before using this script.
-- 
-- To generate real hashes, run:
--   node scripts/generate_password_hash.js cre_tl123
--   node scripts/generate_password_hash.js cre123
--   node scripts/generate_password_hash.js password123
-- 
-- Then replace the password_hash values below with the generated hashes.
-- ============================================================

-- Test CRE_TL (Team Lead)
-- Password: cre_tl123
INSERT INTO users (username, password_hash, role, full_name, email, phone_number, status)
VALUES (
  'cre_tl_test',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- cre_tl123
  'CRE_TL',
  'Test Team Lead',
  'cre_tl@test.com',
  '9876543210',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Test CRE 1
-- Password: cre123
INSERT INTO users (username, password_hash, role, full_name, email, phone_number, status)
VALUES (
  'cre1_test',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- cre123
  'CRE',
  'Test CRE 1',
  'cre1@test.com',
  '9876543211',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Test CRE 2
-- Password: cre123
INSERT INTO users (username, password_hash, role, full_name, email, phone_number, status)
VALUES (
  'cre2_test',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- cre123
  'CRE',
  'Test CRE 2',
  'cre2@test.com',
  '9876543212',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Inactive User (for testing inactive user login)
-- Password: password123
INSERT INTO users (username, password_hash, role, full_name, email, phone_number, status)
VALUES (
  'inactive_user',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- password123
  'CRE',
  'Inactive User',
  'inactive@test.com',
  '9876543213',
  false
)
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- VERIFY USERS CREATED
-- ============================================================
SELECT 
  user_id,
  username,
  role,
  full_name,
  status,
  created_at
FROM users
WHERE username IN ('cre_tl_test', 'cre1_test', 'cre2_test', 'inactive_user')
ORDER BY user_id;

-- ============================================================
-- CLEANUP (Run this to delete test users if needed)
-- ============================================================
-- DELETE FROM users 
-- WHERE username IN ('cre_tl_test', 'cre1_test', 'cre2_test', 'inactive_user');

