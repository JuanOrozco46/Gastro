-- Tabla de LIKES
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Tabla de COMENTARIOS
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de PUBLICACIONES GUARDADAS
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- RLS
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- Políticas post_likes
CREATE POLICY "post_likes_select_all" ON public.post_likes FOR SELECT USING (TRUE);
CREATE POLICY "post_likes_insert_auth" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_likes_delete_auth" ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Políticas post_comments
CREATE POLICY "post_comments_select_all" ON public.post_comments FOR SELECT USING (TRUE);
CREATE POLICY "post_comments_insert_auth" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_comments_delete_auth" ON public.post_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Políticas saved_posts
CREATE POLICY "saved_posts_select_auth" ON public.saved_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saved_posts_insert_auth" ON public.saved_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_posts_delete_auth" ON public.saved_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
