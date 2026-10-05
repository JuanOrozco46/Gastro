-- Phase 2: Restaurant Hours and Profile configuration

-- Create restaurant_hours table
CREATE TABLE IF NOT EXISTS public.restaurant_hours (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon, ..., 6=Sat
    is_open boolean DEFAULT true,
    open_time time,
    close_time time,
    open_time2 time,
    close_time2 time,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(restaurant_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;

-- Policies for restaurant_hours
DROP POLICY IF EXISTS "Public can view restaurant hours" ON public.restaurant_hours;
CREATE POLICY "Public can view restaurant hours"
ON public.restaurant_hours FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Owners can manage restaurant hours" ON public.restaurant_hours;
CREATE POLICY "Owners can manage restaurant hours"
ON public.restaurant_hours FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = restaurant_hours.restaurant_id
        AND r.owner_user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = restaurant_hours.restaurant_id
        AND r.owner_user_id = auth.uid()
    )
);

-- Extend restaurants table with necessary profile fields if missing
ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_order numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_radius_km numeric DEFAULT 5,
ADD COLUMN IF NOT EXISTS estimated_delivery_minutes text,
ADD COLUMN IF NOT EXISTS specialties text[],
ADD COLUMN IF NOT EXISTS accepting_orders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS delivery_modes text[] DEFAULT ARRAY['pickup', 'restaurant_delivery', 'table_service']::text[];

-- Update RPC or RLS for restaurants so owners can update these fields securely
DROP POLICY IF EXISTS "Owners can update their restaurant profile" ON public.restaurants;
CREATE POLICY "Owners can update their restaurant profile"
ON public.restaurants FOR UPDATE
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());
