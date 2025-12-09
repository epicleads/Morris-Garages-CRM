-- Export Templates and History Schema
-- Run this in your Supabase SQL editor

-- Export Templates Table
CREATE TABLE IF NOT EXISTS public.export_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('leads', 'qualified_leads', 'all_leads', 'fresh_leads', 'unassigned_leads')),
  columns JSONB NOT NULL, -- Array of column names to export
  filters JSONB, -- Saved filter configuration
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'excel', 'pdf')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_default BOOLEAN DEFAULT FALSE
);

-- Export History Table
CREATE TABLE IF NOT EXISTS public.export_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  template_id BIGINT REFERENCES export_templates(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT, -- Size in bytes
  row_count INTEGER NOT NULL,
  filters_applied JSONB,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_export_templates_user_id ON public.export_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_export_templates_export_type ON public.export_templates(export_type);
CREATE INDEX IF NOT EXISTS idx_export_history_user_id ON public.export_history(user_id);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON public.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_template_id ON public.export_history(template_id);

-- Comments
COMMENT ON TABLE public.export_templates IS 'Saved export configurations for reuse';
COMMENT ON TABLE public.export_history IS 'History of all exports performed by users';

