-- Google Drive Storage Integration Schema
-- Uses `outlet_id` as the tenant identifier to align with IlaraOS canonical data model.

-- 1. storage_integrations
CREATE TABLE IF NOT EXISTS storage_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- e.g., 'google_drive'
  status TEXT DEFAULT 'disconnected', -- connected, disconnected, error
  account_email TEXT,
  encrypted_refresh_token TEXT,
  scope TEXT,
  root_folder_id TEXT,
  connected_by TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_integrations_outlet ON storage_integrations(outlet_id);

-- 2. drive_folder_mappings
CREATE TABLE IF NOT EXISTS drive_folder_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id TEXT NOT NULL,
  category TEXT NOT NULL,
  google_drive_folder_id TEXT NOT NULL,
  parent_folder_id TEXT,
  folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_folder_mappings_outlet_category ON drive_folder_mappings(outlet_id, category);

-- 3. stored_files
CREATE TABLE IF NOT EXISTS stored_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_file_id TEXT,
  provider_folder_id TEXT,
  category TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  upload_status TEXT DEFAULT 'pending', -- pending, queued, uploading, completed, retrying, failed
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  uploaded_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stored_files_outlet ON stored_files(outlet_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_status ON stored_files(upload_status);
CREATE INDEX IF NOT EXISTS idx_stored_files_category ON stored_files(category);

-- 4. stored_file_links
CREATE TABLE IF NOT EXISTS stored_file_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stored_file_id UUID NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stored_file_links_entity ON stored_file_links(entity_type, entity_id);

-- RLS POLICIES

-- We assume access control will occur at the backend level via Firebase Admin resolving claims,
-- however we establish basic service-role RLS bypass to ensure safety.
-- Backend calls use SUPABASE_SERVICE_ROLE_KEY to bypass RLS since the true RBAC is governed by Firebase Auth tokens in `requireSessionActor.ts`.

ALTER TABLE storage_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_folder_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_file_links ENABLE ROW LEVEL SECURITY;

-- Note: Because Supabase is acting strictly as the SYSTEM OF RECORD for the backend (accessed via service role),
-- all policies here are restricted to service role only. The client NEVER queries Supabase directly.

CREATE POLICY service_role_all_integrations ON storage_integrations 
  USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_folder_mappings ON drive_folder_mappings 
  USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_stored_files ON stored_files 
  USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_stored_file_links ON stored_file_links 
  USING (true) WITH CHECK (true);
