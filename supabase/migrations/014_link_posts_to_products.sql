-- ============================================================================
-- GASTROSYNC - VINCULAR POSTS CON PRODUCTOS
-- Versión: 014_link_posts_to_products.sql
-- Descripción: Crea productos para posts huérfanos y los vincula automáticamente
-- ============================================================================

-- Esta migración soluciona el problema de posts sin product_id que no pueden
-- ser agregados al carrito. Para cada post sin product_id:
-- 1. Crea un producto automáticamente con los datos del post
-- 2. Vincula el post con el producto creado

DO $$
DECLARE
  orphan_post RECORD;
  new_product_id uuid;
  product_category text;
BEGIN
  RAISE NOTICE 'Iniciando vinculación de posts con productos...';
  
  -- Iterar sobre todos los posts que no tienen product_id
  FOR orphan_post IN 
    SELECT 
      p.id as post_id,
      p.restaurant_id,
      p.title,
      p.description,
      p.price_cop,
      p.media_url,
      p.is_published
    FROM posts p
    WHERE p.product_id IS NULL
    ORDER BY p.created_at DESC
  LOOP
    -- Determinar categoría basada en el título (simple heurística)
    product_category := 'Platos Principales'; -- Default
    
    IF orphan_post.title ~* '(bebida|jugo|gaseosa|refresco|cerveza|vino|café|té)' THEN
      product_category := 'Bebidas';
    ELSIF orphan_post.title ~* '(postre|helado|torta|pastel|flan|dulce)' THEN
      product_category := 'Postres';
    ELSIF orphan_post.title ~* '(entrada|ensalada|sopa|aperitivo)' THEN
      product_category := 'Entradas';
    END IF;
    
    -- Verificar si ya existe un producto con el mismo nombre en el restaurante
    SELECT id INTO new_product_id
    FROM products
    WHERE restaurant_id = orphan_post.restaurant_id
      AND LOWER(TRIM(name)) = LOWER(TRIM(orphan_post.title))
    LIMIT 1;
    
    IF new_product_id IS NULL THEN
      -- No existe, crear nuevo producto
      INSERT INTO products (
        id,
        restaurant_id,
        name,
        description,
        category,
        price_cop,
        available,
        image_url,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        orphan_post.restaurant_id,
        orphan_post.title,
        COALESCE(orphan_post.description, ''),
        product_category,
        orphan_post.price_cop,
        orphan_post.is_published, -- Si el post está publicado, el producto está disponible
        orphan_post.media_url,
        NOW(),
        NOW()
      )
      RETURNING id INTO new_product_id;
      
      RAISE NOTICE 'Producto creado: % para post: %', new_product_id, orphan_post.post_id;
    ELSE
      RAISE NOTICE 'Producto existente encontrado: % para post: %', new_product_id, orphan_post.post_id;
    END IF;
    
    -- Vincular el post con el producto
    UPDATE posts
    SET product_id = new_product_id,
        updated_at = NOW()
    WHERE id = orphan_post.post_id;
    
    RAISE NOTICE 'Post % vinculado con producto %', orphan_post.post_id, new_product_id;
  END LOOP;
  
  RAISE NOTICE 'Vinculación completada exitosamente.';
END $$;

-- Crear índice para mejorar performance de búsquedas por product_id
CREATE INDEX IF NOT EXISTS idx_posts_product_id ON posts(product_id);

-- Agregar constraint para asegurar integridad referencial (opcional pero recomendado)
-- Nota: Esto evitará que se eliminen productos que están vinculados a posts
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS posts_product_id_fkey;

ALTER TABLE posts
ADD CONSTRAINT posts_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES products(id) 
ON DELETE SET NULL; -- Si se elimina el producto, el post queda sin product_id

-- Comentario final
COMMENT ON COLUMN posts.product_id IS 'UUID del producto en la tabla products. Si es NULL, el post es solo informativo y no se puede agregar al carrito.';

-- Verificación: Contar cuántos posts quedaron sin vincular
DO $$
DECLARE
  unlinked_count integer;
BEGIN
  SELECT COUNT(*) INTO unlinked_count
  FROM posts
  WHERE product_id IS NULL;
  
  IF unlinked_count > 0 THEN
    RAISE WARNING 'Quedan % posts sin vincular a productos. Revisar manualmente.', unlinked_count;
  ELSE
    RAISE NOTICE '✅ Todos los posts están vinculados con productos.';
  END IF;
END $$;
