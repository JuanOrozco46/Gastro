// ============================================================================
// Edge Function: application-assets
// Subida SEGURA de logo/banner para solicitudes públicas de restaurantes.
//
// Por qué existe: los visitantes NO tienen sesión, y permitir INSERT anónimo
// en Storage vía RLS no deja validar nada más que la ruta. Aquí el servidor:
//   - solo firma subidas para solicitudes que existen, están en 'submitted' y
//     son recientes (la ruta SIEMPRE es applications/{application_id}/{kind}.{ext});
//   - valida MIME y tamaño declarados antes de firmar (y el bucket privado los
//     vuelve a imponer: 5 MB, jpeg/png/webp);
//   - tras la subida verifica los BYTES reales (magic numbers) y el tamaño real;
//     un archivo con MIME falso se elimina y nunca se enlaza a la solicitud;
//   - limita el volumen global por hora (freno básico anti-abuso).
// Acción 'cleanup' (solo platform_admin): detecta y borra archivos huérfanos.
//
// Acciones: sign | finalize | cleanup
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://gastrosync.app',
  'https://www.gastrosync.app',
  'https://gastrosync.co',
  'https://www.gastrosync.co',
];

function getAllowedOrigins(): string[] {
  const envList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const singleUrls = [
    Deno.env.get('PUBLIC_APP_URL'),
    Deno.env.get('SITE_URL'),
  ]
    .map((o) => (o ?? '').trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envList, ...singleUrls]));
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // Peticiones server-to-server sin cabecera Origin
  const normalized = origin.trim().replace(/\/+$/, '');
  const allowedList = getAllowedOrigins();
  if (allowedList.includes('*') || allowedList.includes(normalized)) {
    return true;
  }
  try {
    const url = new URL(normalized);
    if (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.gastrosync.app') || url.hostname.endsWith('.gastrosync.co'))
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins();
  const resolvedOrigin = origin && isOriginAllowed(origin)
    ? origin.trim().replace(/\/+$/, '')
    : (allowedOrigins.find((o) => o.startsWith('https://')) ?? allowedOrigins[0]);

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const BUCKET = 'application-assets'
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const BANNER_MAX_BYTES = 12 * 1024 * 1024

const MIME_TO_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const KINDS = ['logo', 'banner'] as const
type Kind = typeof KINDS[number]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SIGN_WINDOW_MINUTES = 30      // desde la creación de la solicitud
const FINALIZE_WINDOW_MINUTES = 90
const GLOBAL_HOURLY_CAP = 40        // solicitudes con imágenes por hora (toda la plataforma)

function json(status: number, body: Record<string, unknown>, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function matchesMagic(ext: string, b: Uint8Array): boolean {
  if (ext === 'jpg') return b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
  if (ext === 'png') {
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    return b.length > 8 && sig.every((v, i) => b[i] === v)
  }
  if (ext === 'webp') {
    // "RIFF" .... "WEBP"
    return b.length > 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  }
  return false
}

serve(async (req) => {
  if (!isOriginAllowed(req.headers.get('Origin'))) {
    return new Response(JSON.stringify({ error: 'Origen CORS no autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
    })
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' }, req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.action !== 'string') throw new HttpError(400, 'Falta la acción')

    // ── cleanup: solo platform_admin ─────────────────────────────────────
    if (body.action === 'cleanup') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) throw new HttpError(401, 'Falta el token de autorización')
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) throw new HttpError(401, 'No autorizado')
      const { data: profile } = await admin.from('profiles').select('platform_role').eq('id', user.id).single()
      if (!profile || profile.platform_role !== 'platform_admin') throw new HttpError(403, 'Permisos insuficientes')

      const dryRun = body.dryRun !== false // por defecto SOLO reporta
      const olderThanHours = Math.max(1, Number(body.olderThanHours ?? 24) || 24)
      const cutoff = Date.now() - olderThanHours * 3600 * 1000

      const { data: folders, error: listErr } = await admin.storage.from(BUCKET).list('applications', { limit: 1000 })
      if (listErr) throw new HttpError(500, 'No se pudo listar el bucket: ' + listErr.message)

      const toDelete: string[] = []
      const kept: string[] = []
      for (const folder of folders ?? []) {
        if (!UUID_RE.test(folder.name)) {
          // Carpeta con nombre no UUID: nunca la crea el flujo legítimo -> candidata
          const { data: strange } = await admin.storage.from(BUCKET).list(`applications/${folder.name}`, { limit: 100 })
          for (const f of strange ?? []) {
            if (f.created_at && new Date(f.created_at).getTime() < cutoff) toDelete.push(`applications/${folder.name}/${f.name}`)
          }
          continue
        }
        const { data: files } = await admin.storage.from(BUCKET).list(`applications/${folder.name}`, { limit: 100 })
        const { data: app } = await admin
          .from('restaurant_applications')
          .select('logo_path, banner_path')
          .eq('id', folder.name)
          .maybeSingle()
        const referenced = new Set<string>([app?.logo_path, app?.banner_path].filter(Boolean) as string[])
        for (const f of files ?? []) {
          const path = `applications/${folder.name}/${f.name}`
          const old = f.created_at ? new Date(f.created_at).getTime() < cutoff : false
          if (referenced.has(path)) kept.push(path)            // válido y enlazado: NUNCA se borra
          else if (old) toDelete.push(path)                    // huérfano antiguo
          else kept.push(path)                                 // reciente: puede estar en curso
        }
      }

      if (!dryRun && toDelete.length > 0) {
        const { error: rmErr } = await admin.storage.from(BUCKET).remove(toDelete)
        if (rmErr) throw new HttpError(500, 'Error al eliminar huérfanos: ' + rmErr.message)
      }
      return json(200, { success: true, dryRun, olderThanHours, orphans: toDelete, keptCount: kept.length }, req)
    }

    // ── sign / finalize: públicas (visitante sin sesión) ─────────────────
    const applicationId = body.applicationId
    if (typeof applicationId !== 'string' || !UUID_RE.test(applicationId)) {
      throw new HttpError(400, 'applicationId inválido')
    }

    const { data: app, error: appErr } = await admin
      .from('restaurant_applications')
      .select('id, status, created_at, logo_path, banner_path')
      .eq('id', applicationId)
      .maybeSingle()
    if (appErr) throw new HttpError(500, 'Error consultando la solicitud')
    if (!app) throw new HttpError(404, 'La solicitud no existe')
    if (app.status !== 'submitted') throw new HttpError(409, 'La solicitud ya no admite imágenes')
    const ageMin = (Date.now() - new Date(app.created_at).getTime()) / 60000

    if (body.action === 'sign') {
      if (ageMin > SIGN_WINDOW_MINUTES) throw new HttpError(410, 'La ventana para subir imágenes expiró')

      const files = body.files
      if (!Array.isArray(files) || files.length < 1 || files.length > 2) {
        throw new HttpError(400, 'Se requieren 1 o 2 archivos (logo y/o banner)')
      }

      // Freno global anti-abuso de almacenamiento
      const since = new Date(Date.now() - 3600 * 1000).toISOString()
      const { count } = await admin
        .from('restaurant_applications')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
        .or('logo_path.not.is.null,banner_path.not.is.null')
      if ((count ?? 0) >= GLOBAL_HOURLY_CAP) {
        throw new HttpError(429, 'Demasiadas subidas recientes. Inténtalo más tarde o envía la solicitud sin imágenes.')
      }

      const seen = new Set<string>()
      const uploads: Array<{ kind: Kind; path: string; token: string }> = []
      for (const f of files as Array<Record<string, unknown>>) {
        const kind = f.kind as Kind
        if (!KINDS.includes(kind) || seen.has(kind)) throw new HttpError(400, 'Tipo de imagen inválido o repetido')
        seen.add(kind)
        const ext = typeof f.contentType === 'string' ? MIME_TO_EXT[f.contentType] : undefined
        if (!ext) throw new HttpError(400, 'Formato no permitido. Solo JPG, PNG o WEBP.')
        const size = Number(f.size)
        if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, 'Tamaño de archivo inválido')
        const maxBytes = kind === 'logo' ? LOGO_MAX_BYTES : BANNER_MAX_BYTES
        if (size > maxBytes) throw new HttpError(413, `La imagen '${kind}' supera el máximo de ${maxBytes / (1024 * 1024)} MB.`)
        if (app[`${kind}_path` as 'logo_path' | 'banner_path']) throw new HttpError(409, `El ${kind} ya fue cargado`)

        // Ruta determinista: máx. 1 archivo por tipo y por solicitud.
        const path = `applications/${applicationId}/${kind}.${ext}`
        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
        if (error || !data) throw new HttpError(500, 'No se pudo preparar la subida: ' + (error?.message ?? ''))
        uploads.push({ kind, path, token: data.token })
      }
      return json(200, { success: true, bucket: BUCKET, uploads }, req)
    }

    if (body.action === 'finalize') {
      if (ageMin > FINALIZE_WINDOW_MINUTES) throw new HttpError(410, 'La ventana para confirmar imágenes expiró')

      const update: Record<string, string> = {}
      const rejected: string[] = []
      const { data: listed } = await admin.storage.from(BUCKET).list(`applications/${applicationId}`, { limit: 20 })

      for (const kind of KINDS) {
        if (app[`${kind}_path` as 'logo_path' | 'banner_path']) continue
        const obj = (listed ?? []).find((o) => o.name.startsWith(`${kind}.`))
        if (!obj) continue
        const ext = obj.name.split('.').pop() ?? ''
        const path = `applications/${applicationId}/${obj.name}`
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
        if (dlErr || !blob) { rejected.push(`${kind}: no se pudo leer`); continue }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const maxBytes = kind === 'logo' ? LOGO_MAX_BYTES : BANNER_MAX_BYTES
        if (bytes.length === 0 || bytes.length > maxBytes) {
          await admin.storage.from(BUCKET).remove([path])
          rejected.push(`${kind}: tamaño inválido`)
          continue
        }
        if (!matchesMagic(ext, bytes)) {
          // MIME falso / archivo no-imagen: se elimina y NO se enlaza.
          await admin.storage.from(BUCKET).remove([path])
          rejected.push(`${kind}: el contenido no es una imagen ${ext.toUpperCase()} válida`)
          continue
        }
        update[`${kind}_path`] = path
      }

      if (Object.keys(update).length > 0) {
        const { error: upErr } = await admin
          .from('restaurant_applications')
          .update(update)
          .eq('id', applicationId)
        if (upErr) throw new HttpError(500, 'No se pudieron enlazar las imágenes: ' + upErr.message)
      }
      return json(200, {
        success: true,
        logo: !!update.logo_path || !!app.logo_path,
        banner: !!update.banner_path || !!app.banner_path,
        rejected,
      }, req)
    }

    throw new HttpError(400, 'Acción desconocida')
  } catch (error: unknown) {
    if (error instanceof HttpError) return json(error.status, { error: error.message }, req)
    const msg = error instanceof Error ? error.message : String(error)
    return json(500, { error: msg }, req)
  }
})
