ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sms_consent_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_status  VARCHAR(20);
