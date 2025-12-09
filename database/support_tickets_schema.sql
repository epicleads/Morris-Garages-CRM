-- Support Tickets System Schema
-- Run this in your Supabase SQL editor

-- Main support_tickets table (you mentioned you already created this, but including for reference)
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  created_by BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL CHECK (category IN ('bug', 'feature', 'question', 'other')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support ticket replies table (for conversation thread)
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  replied_by BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_id ON support_ticket_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_created_at ON support_ticket_replies(created_at);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trigger_update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();

-- Function to auto-delete tickets older than 90 days (run via cron or scheduled job)
CREATE OR REPLACE FUNCTION cleanup_old_support_tickets()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete tickets and their replies (CASCADE will handle replies)
  WITH deleted AS (
    DELETE FROM support_tickets
    WHERE created_at < NOW() - INTERVAL '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (Optional - Commented out since backend uses service role authentication)
-- The backend handles authorization at the application level via middleware
-- If you want to enable RLS, you'll need to adjust these policies based on your auth system

-- Note: Since the backend uses Supabase Admin client (service role), RLS is bypassed
-- Authorization is handled in the backend controllers via the authorize middleware

-- Uncomment and adjust these if you want database-level RLS:
/*
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Example policies (adjust based on your auth system):
-- These would need to work with your actual authentication mechanism
-- Since backend uses JWT tokens and service role, RLS may not be necessary
*/

