# 🚀 Deployment Guide - GastroSync

## Edge Functions Deployment

Las Edge Functions de Supabase necesitan ser desplegadas manualmente después de cada cambio.

### Funciones Activas:

1. **`create-payment`** - Inicializa pagos con Wompi
2. **payment-webhook`** - Recibe notificaciones de estado de pago
3. **`approve_restaurant`** - Aprueba aplicaciones de restaurantes

### Comandos de Despliegue:

```bash
# Desplegar todas las funciones
npx supabase functions deploy

# Desplegar función específica
npx supabase functions deploy create-payment
npx supabase functions deploy payment-webhook
npx supabase functions deploy approve_restaurant
```

### Último Deployment:

**Fecha:** 2025-01-05
**Funciones desplegadas:**
- ✅ `create-payment` - Deployed
- ✅ `payment-webhook` - Deployed

**Project ID:** nqinauaatrzkqfeksnkg

---

## Variables de Entorno Requeridas

### En Vercel (Frontend):
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
```

### En Supabase Edge Functions:
Configurar en: Dashboard → Edge Functions → Settings

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (service_role key)
SUPABASE_ANON_KEY=eyJhbGci... (anon key)
WOMPI_PUBLIC_KEY=pub_test_xxx o pub_prod_xxx
WOMPI_INTEGRITY_SECRET=test_integrity_secret_xxx
WOMPI_EVENTS_SECRET=test_events_xxx
```

---

## Troubleshooting

### Error CORS en Edge Functions

**Síntoma:** 
```
has been blocked by CORS policy
```

**Solución:**
1. Verificar que CORS headers están en la función (`corsHeaders`)
2. Agregar dominio en Supabase Dashboard:
   - Settings → API → CORS
   - Agregar: `https://*.vercel.app`

### Error 404 en Edge Function

**Síntoma:**
```
404 - Edge Function not found
```

**Solución:**
```bash
npx supabase functions deploy [function-name]
```

### Likes funcionan pero Pagos fallan

**Diagnóstico:**
- Likes usan insert directo a tabla ✅
- Pagos usan Edge Function ❌

**Solución:**
1. Redesplegar Edge Function
2. Verificar variables de entorno en Supabase
3. Verificar CORS settings

---

## Migraciones de Base de Datos

```bash
# Aplicar todas las migraciones pendientes
npx supabase db push

# Verificar estado
npx supabase db diff
```

### Última Migración:
- **014_link_posts_to_products.sql** - Vincular posts con productos

---

## Checklist Pre-Production

- [ ] Variables de entorno configuradas en Vercel
- [ ] Edge Functions desplegadas en Supabase
- [ ] Variables de Edge Functions configuradas
- [ ] CORS configurado para dominio de producción
- [ ] Migraciones aplicadas a producción
- [ ] Build de frontend sin errores (`npm run build`)
- [ ] Tests de flujo completo:
  - [ ] Login/Registro
  - [ ] Ver feed de publicaciones
  - [ ] Dar like/comentar
  - [ ] Agregar al carrito
  - [ ] Checkout y pago
  - [ ] Ver pedido en KDS

---

## Monitoring

### Logs de Edge Functions:
Dashboard → Edge Functions → [function-name] → Logs

### Logs de Base de Datos:
Dashboard → Logs → Postgres Logs

### Errores en Frontend:
Vercel Dashboard → [deployment] → Runtime Logs
