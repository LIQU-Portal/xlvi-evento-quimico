import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

class StaffSyncError extends Error {}

export function connectionInfo(env) {
  // Match the application's precedence, not the old bulk-sync script.
  const key = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED'].find(k => env[k]?.trim());
  if (!key) throw new StaffSyncError('Falta una conexión de Neon.');
  const url = new URL(env[key]);
  const fingerprint = createHash('sha256').update(url.hostname.replace('-pooler', '') + url.pathname).digest('hex').slice(0, 12);
  return { key, fingerprint, connection: env[key] };
}

export async function readStaff(url, secret, { fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`Consultando únicamente Staff (intento ${attempt}/3)...`);
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'listStaffRegistrations', secret }), redirect: 'follow', signal: AbortSignal.timeout(90_000) });
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        if (attempt < 3) { await sleep(attempt * 1500); continue; }
        throw new StaffSyncError('El servicio no está disponible; no se guardó ningún cambio.');
      }
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { throw new StaffSyncError('Apps Script devolvió HTML u otra respuesta no JSON. Revisa URL /exec y permisos.'); }
      if (!response.ok || !result.ok || !Array.isArray(result.staff)) throw new StaffSyncError('Publica Code.gs actualizado en la implementación existente; falta una respuesta válida de listStaffRegistrations.');
      return result.staff;
    } catch (error) {
      const transient = error?.name === 'TimeoutError' || error instanceof TypeError || ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
      if (!transient) throw error;
      if (attempt === 3) throw new StaffSyncError('La conexión falló tras 3 intentos. No se guardó ningún cambio. Usa una red estable.');
      await sleep(attempt * 1500);
    }
  }
}

export function validateStaff(rows) {
  const seen = new Set();
  if (!rows.length) throw new StaffSyncError('La lista de Staff está vacía; no se modificó nada.');
  return rows.map(row => {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email.includes('@') || seen.has(email)) throw new StaffSyncError('Staff contiene un correo inválido o duplicado.');
    seen.add(email);
    if (!/^EQ26-[A-F0-9]{10}$/.test(row.id ?? '') || row.status !== 'Confirmado') throw new StaffSyncError(`La persona ${email} debe completar su registro general antes de sincronizar.`);
    if (!['Staff', 'Alumno', 'Profesor'].includes(row.role)) throw new StaffSyncError('Clasificación de Staff inválida.');
    if (row.role === 'Staff' && !['Alumno', 'Académico'].includes(row.staffType)) throw new StaffSyncError('staffType inválido.');
    if (!['', 'Apoyo operativo', 'Registro de asistencia'].includes(row.staffFunction ?? '')) throw new StaffSyncError('staffFunction inválido.');
    return { email, id: row.id, role: row.role, staffType: row.role === 'Staff' ? row.staffType : '', staffFunction: row.role === 'Staff' ? row.staffFunction ?? '' : '' };
  });
}

export const updateStaffQuery = `UPDATE participants p SET role = s.role,
  staff_type = NULLIF(s."staffType", ''), staff_function = NULLIF(s."staffFunction", ''), updated_at = NOW()
  FROM jsonb_to_recordset($1::jsonb) AS s(email text, id text, role text, "staffType" text, "staffFunction" text)
  WHERE lower(p.email) = s.email AND p.id = s.id AND p.status = 'Confirmado'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS expected(email text, id text)
      WHERE NOT EXISTS (SELECT 1 FROM participants existing WHERE lower(existing.email)=expected.email AND existing.id=expected.id AND existing.status='Confirmado')
    ) RETURNING p.email`;

export function selectMatchingStaff(staff, existing, skipMissing, log = console.log) {
  const matching = [];
  for (const person of staff) {
    const found = existing.find(p => p.email === person.email);
    if (!found && skipMissing) {
      log(`Pendiente, sin cambios: ${person.email} no existe en Neon.`);
      continue;
    }
    if (!found || found.id !== person.id || found.status !== 'Confirmado') {
      throw new StaffSyncError('Hay personas ausentes o con ID/estado distinto en Neon. No se guardó nada. --skip-missing solo permite omitir ausentes, nunca diferencias de ID o estado.');
    }
    matching.push(person);
  }
  if (!matching.length) throw new StaffSyncError('No hay cuentas coincidentes para sincronizar. No se guardó nada.');
  return matching;
}

export async function main(env = process.env, args = process.argv.slice(2)) {
  const info = connectionInfo(env);
  console.log(`Destino: ${info.key}; huella ${info.fingerprint}. No se muestra la conexión.`);
  const expected = args.find(a => a.startsWith('--expected-fingerprint='))?.split('=')[1];
  if (expected && expected !== info.fingerprint) throw new StaffSyncError('La huella no coincide. No se consultó ni modificó la base.');
  const apply = args.includes('--apply');
  if (apply && !expected) throw new StaffSyncError('Para guardar debes indicar --expected-fingerprint=HUELLA.');
  if (!env.REGISTRATION_API_URL || !env.REGISTRATION_API_SECRET) throw new StaffSyncError('Faltan las variables del servicio de registros.');
  const endpoint = new URL(env.REGISTRATION_API_URL.trim());
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' || !endpoint.pathname.endsWith('/exec')) throw new StaffSyncError('REGISTRATION_API_URL debe ser la URL de Apps Script terminada en /exec.');
  let staff = validateStaff(await readStaff(endpoint.href, env.REGISTRATION_API_SECRET.trim()));
  console.log(`${staff.length} personas en Staff. No se consultaron todos los participantes ni las inscripciones.`);
  const sql = neon(info.connection);
  const existing = await sql.query('SELECT id, lower(email) AS email, status FROM participants WHERE lower(email) = ANY($1::text[])', [staff.map(s => s.email)]);
  staff = selectMatchingStaff(staff, existing, args.includes('--skip-missing'));
  console.log(`${staff.length} cuentas coincidentes listas para sincronizar.`);
  if (!apply) { console.log('Revisión correcta SIN CAMBIOS. Para guardar repite con --apply y --expected-fingerprint=' + info.fingerprint); return; }
  // One atomic statement: safe to rerun after a lost response; never modifies identity, QR or access grants.
  const updated = await sql.query(updateStaffQuery, [JSON.stringify(staff)]);
  if (updated.length !== staff.length) throw new StaffSyncError('El estado cambió antes de guardar; revisa el destino. No se aplicó la actualización por lote.');
  console.log(`${updated.length} personas sincronizadas. ID, QR, inscripciones y permisos de operadores conservados. Recarga Administración para habilitar y asignar sesiones.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  // Driver failures can contain URLs, payloads or other private data. Never print raw errors.
  console.error(error instanceof StaffSyncError ? error.message : 'No se pudo completar la sincronización. Revisa conectividad, destino y versión publicada de Code.gs. Puedes repetir: la actualización es atómica e idempotente.');
  process.exitCode = 1;
});
