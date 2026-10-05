-- Migration 021: Extended fields for restaurant onboarding applications
-- Safely add description, estimated delivery time, schedules, and logo/banner URLs

ALTER TABLE public.restaurant_applications
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS estimated_delivery_minutes INTEGER CHECK (estimated_delivery_minutes IS NULL OR estimated_delivery_minutes >= 0),
  ADD COLUMN IF NOT EXISTS schedule_hours TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Create index for querying duplicate pending applications by email or status
CREATE INDEX IF NOT EXISTS idx_restaurant_apps_email_status 
  ON public.restaurant_applications (owner_email, status);
