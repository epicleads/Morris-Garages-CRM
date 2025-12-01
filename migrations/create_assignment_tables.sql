-- Create auto_assign_configs table
CREATE TABLE IF NOT EXISTS public.auto_assign_configs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  sub_source TEXT,
  cre_id TEXT NOT NULL,
  cre_name TEXT NOT NULL,
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE(source, sub_source, cre_id)
);

-- Create telein_assignments table
CREATE TABLE IF NOT EXISTS public.telein_assignments (
  id BIGSERIAL PRIMARY KEY,
  telein_no TEXT NOT NULL UNIQUE,
  cre_id TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_auto_assign_configs_source ON public.auto_assign_configs(source, sub_source);
CREATE INDEX IF NOT EXISTS idx_auto_assign_configs_active ON public.auto_assign_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_telein_assignments_telein_no ON public.telein_assignments(telein_no);
CREATE INDEX IF NOT EXISTS idx_telein_assignments_cre_id ON public.telein_assignments(cre_id);

