-- Phase 3: Advanced Menu Configuration

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tags text[],
ADD COLUMN IF NOT EXISTS preparation_time_minutes integer,
ADD COLUMN IF NOT EXISTS ingredients text[],
ADD COLUMN IF NOT EXISTS allergens text[];

-- Create an index to quickly filter out archived products for customers
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products (restaurant_id, available, is_archived);

-- Update RLS policies to allow updating these fields
DROP POLICY IF EXISTS "Owners can update their products" ON public.products;
CREATE POLICY "Owners can update their products"
ON public.products FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = products.restaurant_id
        AND r.owner_user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = products.restaurant_id
        AND r.owner_user_id = auth.uid()
    )
);

-- Delete policy should already exist from Phase 1/initial schema
-- but we must ensure it only deletes if no order relies on it, or the DB foreign key will throw an error.
-- The order items table does NOT exist yet, orders store JSON! 
-- So if orders store JSON, we can actually delete physically, but business rule says:
-- "no eliminar físicamente un producto que tenga pedidos históricos; usar archivado lógico cuando tenga historial"

-- We can enforce this via a trigger or just let the application layer handle the archiving logic.
-- To be absolutely safe, let's create a function that archives instead of deleting if orders exist.
