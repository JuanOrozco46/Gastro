-- Migration: Toggle Like RPC

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- Obtener el usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- Verificar si el like ya existe
  SELECT EXISTS(
    SELECT 1 FROM public.post_likes 
    WHERE post_id = p_post_id AND user_id = v_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Quitar like
    DELETE FROM public.post_likes 
    WHERE post_id = p_post_id AND user_id = v_user_id;
    RETURN FALSE; -- Ahora no está liked
  ELSE
    -- Dar like
    INSERT INTO public.post_likes (post_id, user_id) 
    VALUES (p_post_id, v_user_id);
    RETURN TRUE; -- Ahora está liked
  END IF;
END;
$$;
