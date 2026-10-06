-- 031_fix_members_rls_and_status.sql
-- ============================================================================
-- 1. UPDATE SECURITY DEFINER FUNCTIONS TO INCLUDE STATUS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_restaurant_owner(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id 
      AND rm.restaurant_id = p_restaurant_id 
      AND rm.role = 'owner'
      AND (rm.status = 'active' OR rm.status IS NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id 
      AND rm.restaurant_id = p_restaurant_id
      AND (rm.status = 'active' OR rm.status IS NULL)
  );
END;
$$;

-- ============================================================================
-- 2. FIX RLS INFINITE RECURSION IN restaurant_members
-- ============================================================================

DROP POLICY IF EXISTS "members_select_policy" ON public.restaurant_members;

CREATE POLICY "members_select_policy"
  ON public.restaurant_members
  FOR SELECT
  USING (
    user_id = auth.uid() -- Can see their own record
    OR public.is_restaurant_owner(auth.uid(), restaurant_id) -- Bypasses RLS to avoid infinite recursion
    OR EXISTS (
      -- Platform admin
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'platform_admin'
    )
  );

-- ============================================================================
-- 3. ENSURE IDEMPOTENT DATA CORRECTION
-- ============================================================================
-- Ensure all historical valid rows get status = 'active' just in case the previous update missed it.
UPDATE public.restaurant_members 
SET status = 'active'
WHERE status IS NULL OR status = '';

-- ============================================================================
-- 4. FIX RPC updated logic for owners
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invite_restaurant_staff(
  p_restaurant_id UUID,
  p_email TEXT
) RETURNS JSONB AS $$
DECLARE
  v_normalized_email TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- 1. Authorization
  IF NOT public.is_restaurant_owner(auth.uid(), p_restaurant_id) AND 
     NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_role = 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized. Only active owners can invite staff.';
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

CREATE OR REPLACE FUNCTION public.update_member_status(
  p_member_id UUID,
  p_new_status TEXT
) RETURNS JSONB AS $$
DECLARE
  v_target_member public.restaurant_members;
  v_active_owners_count INT;
BEGIN
  -- 1. Get target member
  SELECT * INTO v_target_member FROM public.restaurant_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- 2. Authorization
  IF NOT public.is_restaurant_owner(auth.uid(), v_target_member.restaurant_id) AND 
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

CREATE OR REPLACE FUNCTION public.resend_restaurant_invitation(
  p_member_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_target_member public.restaurant_members;
BEGIN
  -- Get the target member
  SELECT * INTO v_target_member FROM public.restaurant_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  -- Verify owner
  IF NOT public.is_restaurant_owner(auth.uid(), v_target_member.restaurant_id) AND 
     NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND platform_role = 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF v_target_member.status != 'invited' THEN
    RAISE EXCEPTION 'Cannot resend. Status is not invited.';
  END IF;

  -- Update
  UPDATE public.restaurant_members
  SET invited_at = NOW()
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
