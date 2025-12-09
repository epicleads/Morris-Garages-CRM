-- Update developer account role to 'Developer'
-- Run this in your Supabase SQL editor or via psql

UPDATE users
SET role = 'Developer'
WHERE username = 'developer';

-- Verify the update
SELECT user_id, username, role, full_name, status
FROM users
WHERE username = 'developer';

-- If your database has a CHECK constraint on the role column, you may need to update it first:
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Admin', 'CRE', 'CRE_TL', 'Developer'));

