# 🔧 Configuración de Supabase para Vercel

## Problema Actual
Error CORS en Vercel: "Access to XMLHttpRequest has been blocked by CORS policy"

## ✅ Solución Paso a Paso

### 1. Verificar Variables de Entorno en Vercel

Ve a tu proyecto en Vercel → Settings → Environment Variables

**Debes tener:**
```
VITE_SUPABASE_URL = https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **IMPORTANTE:** 
- Los nombres DEBEN empezar con `VITE_` (no `NEXT_PUBLIC_`)
- Aplicar a: Production, Preview y Development
- Después de agregar, hacer **Redeploy** del proyecto

---

### 2. Configurar CORS en Supabase Dashboard

1. Ve a tu proyecto en Supabase Dashboard
2. Settings → API → Configuration
3. En "URL Configuration" → Add URL
4. Agrega tu dominio de Vercel:
   ```
   https://tu-app.vercel.app
   ```
5. Si tienes preview deploys, agrega también:
   ```
   https://*.vercel.app
   ```

---

### 3. Obtener las Credenciales Correctas

**Supabase Dashboard → Settings → API:**

```
Project URL: https://xxxxx.supabase.co
```
☝️ Copiar esto a `VITE_SUPABASE_URL`

```
anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...
```
☝️ Copiar esto a `VITE_SUPABASE_PUBLISHABLE_KEY`

---

### 4. Verificar en Vercel

Después de configurar:

1. **Redeploy** el proyecto en Vercel
2. Abre la consola del navegador (F12)
3. Busca: `🔍 Supabase Configuration Debug`
4. Verifica que diga:
   - ✅ `Has VITE_SUPABASE_URL: true`
   - ✅ `Has VITE_SUPABASE_PUBLISHABLE_KEY: true`
   - ✅ `URL starts with https: true`

---

## 🐛 Debug

Si sigues teniendo errores, verifica:

### A. En la Consola del Navegador:
```javascript
// Pega esto en la consola de Vercel
console.log('URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('Key:', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.substring(0, 20))
```

### B. Error específico de CORS:
Si ves: "has been blocked by CORS policy"
→ **Ve al paso 2** y agrega tu dominio de Vercel en Supabase

### C. Error "Invalid HTTP status 0":
→ Las variables de entorno NO están configuradas en Vercel
→ **Ve al paso 1** y configúralas

---

## ✅ Checklist

- [ ] Variables de entorno agregadas en Vercel
- [ ] Nombres correctos: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Dominio de Vercel agregado en Supabase CORS settings
- [ ] Redeploy realizado después de cambios
- [ ] Consola del navegador sin errores CORS
- [ ] Debug muestra configuración correcta

---

## 📞 Siguiente Paso

Una vez configurado correctamente, **todos los posts deberían mostrar likes reales** y el botón "Añadir al Carrito" debería funcionar sin errores.
