-- Add emergency contact fields to profiles
-- Used for hospital check-in saved phrases

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_phone text;
