-- 041_posts_archive.sql

-- Add is_archived to posts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_archived') THEN
    ALTER TABLE public.posts ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END
$$;

-- Create RPC to delete or archive a post securely
CREATE OR REPLACE FUNCTION delete_restaurant_post(p_post_id UUID, p_restaurant_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_member_role TEXT;
  v_member_status TEXT;
  v_is_platform_admin BOOLEAN;
  v_post RECORD;
  v_likes_count INT;
  v_comments_count INT;
  v_saved_count INT;
  v_media_url TEXT;
  v_action_taken TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify platform admin
  SELECT (platform_role = 'platform_admin') INTO v_is_platform_admin
  FROM public.profiles
  WHERE id = v_user_id;

  -- Verify restaurant member and status
  SELECT role, status INTO v_member_role, v_member_status
  FROM public.restaurant_members
  WHERE user_id = v_user_id AND restaurant_id = p_restaurant_id;

  -- Validations
  IF v_is_platform_admin IS NOT TRUE THEN
    IF v_member_role IS NULL THEN
      RAISE EXCEPTION 'Not authorized: No membership found for this restaurant';
    END IF;

    IF v_member_status != 'active' THEN
      RAISE EXCEPTION 'Not authorized: Membership status is %', v_member_status;
    END IF;

    IF v_member_role = 'staff' THEN
      RAISE EXCEPTION 'Not authorized: Staff members cannot delete or archive posts';
    END IF;

    IF v_member_role != 'owner' THEN
      RAISE EXCEPTION 'Not authorized: Only owners can delete or archive posts';
    END IF;
  END IF;

  SELECT * INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.restaurant_id != p_restaurant_id THEN
    RAISE EXCEPTION 'Post belongs to another restaurant';
  END IF;

  -- Store media url in case the client needs to delete it from storage
  v_media_url := v_post.media_url;

  -- Check dependencies
  SELECT COUNT(*) INTO v_likes_count FROM public.post_likes WHERE post_id = p_post_id;
  SELECT COUNT(*) INTO v_comments_count FROM public.post_comments WHERE post_id = p_post_id;
  SELECT COUNT(*) INTO v_saved_count FROM public.saved_posts WHERE post_id = p_post_id;

  IF v_likes_count > 0 OR v_comments_count > 0 OR v_saved_count > 0 THEN
    -- Archive logically
    UPDATE public.posts
    SET is_archived = TRUE, updated_at = NOW()
    WHERE id = p_post_id;
    
    v_action_taken := 'archived';
  ELSE
    -- Physical delete
    DELETE FROM public.posts WHERE id = p_post_id;
    v_action_taken := 'deleted';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action_taken,
    'media_url', v_media_url
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION delete_restaurant_post(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_restaurant_post(UUID, UUID) TO authenticated;
