-- 030_team_members_management.sql
-- ============================================================================
-- 1. ADD NEW COLUMNS AND MIGRATION OF PRIMARY KEY
-- ============================================================================

-- Add new columns allowing NULLs temporarily
ALTER TABLE public.restaurant_members 
  ADD COLUMN id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN email TEXT,
  ADD COLUMN status TEXT,
  ADD COLUMN invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN invited_at TIMESTAMPTZ,
  ADD COLUMN accepted_at TIMESTAMPTZ,
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Assign a unique UUID to existing records
UPDATE public.restaurant_members SET id = gen_random_uuid() WHERE id IS NULL;

-- Mark existing records as 'active' and attempt to fetch their email from auth.users (if accessible via view or similar, but since we might not have access to auth.users email directly in a standard update due to security definer issues, we will just set status first).
UPDATE public.restaurant_members 
SET status = 'active',
    accepted_at = created_at
WHERE status IS NULL;

-- Make id NOT NULL
ALTER TABLE public.restaurant_members ALTER COLUMN id SET NOT NULL;

-- Drop existing composite primary key
ALTER TABLE public.restaurant_members DROP CONSTRAINT IF EXISTS restaurant_members_pkey;

-- Set new primary key
ALTER TABLE public.restaurant_members ADD PRIMARY KEY (id);

-- Make user_id nullable for pending invitations
ALTER TABLE public.restaurant_members ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================================
-- 2. INTEGRITY CONSTRAINTS
-- ============================================================================

-- Validate status
ALTER TABLE public.restaurant_members 
  ADD CONSTRAINT chk_restaurant_members_status 
  CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));

-- Active status requires user_id
ALTER TABLE public.restaurant_members
  ADD CONSTRAINT chk_active_requires_user
  CHECK (
    (status = 'active' AND user_id IS NOT NULL AND accepted_at IS NOT NULL) OR
    (status != 'active')
  );

-- Revoked status validation
ALTER TABLE public.restaurant_members
  ADD CONSTRAINT chk_revoked_logic
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL) OR
    (status != 'revoked')
  );

-- Maintain historic uniqueness: A user can only have one membership per restaurant.
CREATE UNIQUE INDEX idx_unique_restaurant_user 
  ON public.restaurant_members(restaurant_id, user_id) 
  WHERE user_id IS NOT NULL;

-- Normalize email and prevent duplicate active invitations
CREATE UNIQUE INDEX idx_unique_active_invitation 
  ON public.restaurant_members(restaurant_id, lower(email)) 
  WHERE status IN ('invited', 'active', 'suspended');

-- General indexes for queries
CREATE INDEX idx_members_restaurant_id ON public.restaurant_members(restaurant_id);
CREATE INDEX idx_members_user_id ON public.restaurant_members(user_id);
CREATE INDEX idx_members_email ON public.restaurant_members(lower(email));
CREATE INDEX idx_members_status ON public.restaurant_members(status);
CREATE INDEX idx_members_invited_by ON public.restaurant_members(invited_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_members_updated_at ON public.restaurant_members;
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON public.restaurant_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Drop old policies if any
DROP POLICY IF EXISTS "restaurant_members_select" ON public.restaurant_members;
DROP POLICY IF EXISTS "restaurant_members_insert" ON public.restaurant_members;
DROP POLICY IF EXISTS "restaurant_members_update" ON public.restaurant_members;
DROP POLICY IF EXISTS "restaurant_members_delete" ON public.restaurant_members;

-- 3.1 SELECT: Owner sees all for their restaurant. Staff sees only themselves. Platform admin sees all.
CREATE POLICY "members_select_policy"
  ON public.restaurant_members
  FOR SELECT
  USING (
    user_id = auth.uid() -- They can see their own record
    OR EXISTS (
      -- They are an owner of the same restaurant
      SELECT 1 FROM public.restaurant_members rm
      WHERE rm.restaurant_id = public.restaurant_members.restaurant_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'owner'
        AND rm.status = 'active'
    )
    OR EXISTS (
      -- Platform admin
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'platform_admin'
    )
  );

-- Inserts and Updates will be managed strictly via secure RPCs (Service Role). 
-- This prevents frontend from forging insertions directly.
CREATE POLICY "members_insert_policy"
  ON public.restaurant_members
  FOR INSERT
  WITH CHECK (false); -- ONLY allowed via service role / backend

CREATE POLICY "members_update_policy"
  ON public.restaurant_members
  FOR UPDATE
  USING (false); -- ONLY allowed via service role / backend

CREATE POLICY "members_delete_policy"
  ON public.restaurant_members
  FOR DELETE
  USING (false); -- We don't delete, we revoke.

-- ============================================================================
-- 4. SECURE RPCs
-- ============================================================================

-- Invitar staff (Owner only)
CREATE OR REPLACE FUNCTION public.invite_restaurant_staff(
  p_restaurant_id UUID,
  p_email TEXT
) RETURNS JSONB AS $$
DECLARE
  v_caller_role TEXT;
  v_normalized_email TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- 1. Authorization
  SELECT role INTO v_caller_role FROM public.restaurant_members
  WHERE restaurant_id = p_restaurant_id AND user_id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_role = 'platform_admin') THEN
      RAISE EXCEPTION 'Not authorized. Only active owners can invite staff.';
    END IF;
  END IF;

  -- 2. Validate email
  v_normalized_email := trim(lower(p_email));
  IF v_normalized_email = '' OR v_normalized_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Invalid email format.';
  END IF;

  -- 3. Check for duplicates
  SELECT id INTO v_existing_id FROM public.restaurant_members 
  WHERE restaurant_id = p_restaurant_id AND lower(email) = v_normalized_email AND status IN ('invited', 'active', 'suspended');

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already exists or has a pending invitation for this restaurant.';
  END IF;

  -- 4. Insert invitation (will need service_role logic externally to send real email, but we store it)
  INSERT INTO public.restaurant_members (
    restaurant_id, email, role, status, invited_by, invited_at
  ) VALUES (
    p_restaurant_id, v_normalized_email, 'staff', 'invited', auth.uid(), NOW()
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'member_id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Suspender / Reactivar / Revocar (Owner only)
CREATE OR REPLACE FUNCTION public.update_member_status(
  p_member_id UUID,
  p_new_status TEXT
) RETURNS JSONB AS $$
DECLARE
  v_target_member public.restaurant_members;
  v_caller_role TEXT;
  v_active_owners_count INT;
BEGIN
  -- 1. Get target member
  SELECT * INTO v_target_member FROM public.restaurant_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- 2. Authorization
  SELECT role INTO v_caller_role FROM public.restaurant_members
  WHERE restaurant_id = v_target_member.restaurant_id AND user_id = auth.uid() AND status = 'active';

  IF (v_caller_role IS NULL OR v_caller_role != 'owner') AND 
     NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_role = 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized. Only active owners can modify members.';
  END IF;

  -- 3. Target logic
  IF v_target_member.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own status.';
  END IF;

  IF p_new_status NOT IN ('suspended', 'active', 'revoked') THEN
    RAISE EXCEPTION 'Invalid target status.';
  END IF;

  -- Protect last owner
  IF v_target_member.role = 'owner' AND p_new_status IN ('suspended', 'revoked') THEN
    SELECT COUNT(*) INTO v_active_owners_count 
    FROM public.restaurant_members 
    WHERE restaurant_id = v_target_member.restaurant_id AND role = 'owner' AND status = 'active' AND id != p_member_id;
    
    IF v_active_owners_count = 0 THEN
      RAISE EXCEPTION 'Cannot suspend or revoke the last active owner of the restaurant.';
    END IF;
  END IF;

  -- 4. Perform update
  IF p_new_status = 'revoked' THEN
    UPDATE public.restaurant_members 
    SET status = p_new_status, revoked_at = NOW() 
    WHERE id = p_member_id;
  ELSE
    UPDATE public.restaurant_members 
    SET status = p_new_status, revoked_at = NULL 
    WHERE id = p_member_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Aceptar invitación
CREATE OR REPLACE FUNCTION public.accept_restaurant_invitation(
  p_member_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_target_member public.restaurant_members;
  v_user_email TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Find the invitation
  SELECT * INTO v_target_member FROM public.restaurant_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  IF v_target_member.status != 'invited' THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %).', v_target_member.status;
  END IF;

  -- Validate email match (case insensitive)
  IF lower(v_target_member.email) != lower(v_user_email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address.';
  END IF;

  -- Update to active
  UPDATE public.restaurant_members
  SET status = 'active',
      user_id = auth.uid(),
      accepted_at = NOW()
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reenviar invitación (Owner only)
CREATE OR REPLACE FUNCTION public.resend_restaurant_invitation(
  p_member_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_target_member public.restaurant_members;
  v_caller_role TEXT;
BEGIN
  -- Get the target member
  SELECT * INTO v_target_member FROM public.restaurant_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  -- Verify owner
  SELECT role INTO v_caller_role FROM public.restaurant_members
  WHERE restaurant_id = v_target_member.restaurant_id AND user_id = auth.uid() AND status = 'active';

  IF (v_caller_role IS NULL OR v_caller_role != 'owner') AND 
     NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_role = 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF v_target_member.status != 'invited' THEN
    RAISE EXCEPTION 'Cannot resend. Status is not invited.';
  END IF;

  -- Just update invited_at to trigger any backend hook if needed, or simply record it.
  UPDATE public.restaurant_members
  SET invited_at = NOW()
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
