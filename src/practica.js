// Modo práctica: la app completa con datos de ejemplo, para aprender o capacitar a alguien
// sin tocar nada real. Todo vive en la memoria de esta pestaña: al salir (o recargar
// después de salir) desaparece. No se conecta a Supabase ni usa la copia local real.
const CLAVE = 'ld-practica';

export function enPractica() {
  try { return sessionStorage.getItem(CLAVE) === '1'; } catch (e) { return false; }
}
export function entrarPractica() {
  try { sessionStorage.setItem(CLAVE, '1'); } catch (e) { return; }
  location.hash = ''; location.reload();
}
export function salirPractica() {
  try { sessionStorage.removeItem(CLAVE); } catch (e) {}
  location.hash = ''; location.reload();
}
export const USUARIO_PRACTICA = { id: 'practica', email: 'practica@ldrental.com.ar', last_sign_in_at: new Date().toISOString() };

// ---------- Datos de ejemplo ----------
const isoDe = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const haceDias = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return isoDe(d); };
const enDias = n => haceDias(-n);

function datosEjemplo() {
  const drivers = [
    { id: 'pd1', nombre: 'Martín Gómez', tel: '+5491155550101', dni: '30111222', licVenc: enDias(200), direccion: 'Av. Rivadavia 5200, CABA' },
    { id: 'pd2', nombre: 'Lucía Fernández', tel: '+5491155550102', dni: '32444555', licVenc: enDias(25) },
    { id: 'pd3', nombre: 'Jorge Ramírez', tel: '+5491155550103', dni: '28999888', licVenc: enDias(400) },
    { id: 'pd4', nombre: 'Carla Benítez', tel: '+5491155550104', dni: '35666777', licVenc: enDias(90) },
    { id: 'pd5', nombre: 'Diego Sosa', tel: '+5491155550105', dni: '31222333', prospecto: true },
  ];
  const auto = (id, patente, marca, modelo, anio, color, tipo, choferId, monto, inicioDias, km, extra) => Object.assign({
    id, patente, marca, modelo, anio, color, tipo, choferId: choferId || '', monto: monto || 0, inicio: choferId ? haceDias(inicioDias) : '', km,
    vtv: enDias(120), seguro: enDias(40), impuesto: enDias(75), cedula: enDias(700), gncOblea: enDias(150), gncHidraulica: enDias(500), habilitacion: enDias(300), combustible: 'GNC',
  }, extra || {});
  const cars = [
    auto('pc1', 'AE 123 BC', 'Fiat', 'Cronos', 2022, 'Blanco', 'alquiler', 'pd1', 300000, 63, 84500),
    auto('pc2', 'AD 456 FG', 'Chevrolet', 'Onix', 2021, 'Gris', 'alquiler', 'pd2', 280000, 35, 102300, { vtv: enDias(6) }),
    auto('pc3', 'AF 789 HJ', 'Toyota', 'Etios', 2020, 'Negro', 'alquiler', 'pd3', 260000, 120, 141000),
    auto('pc4', 'AC 321 KL', 'Volkswagen', 'Voyage', 2019, 'Rojo', 'financiado', 'pd4', 250, 50, 120000, { cuotas: 104 }),
    auto('pc5', 'AB 654 MN', 'Renault', 'Logan', 2018, 'Plata', 'taller', '', 0, 0, 160500),
    auto('pc6', 'AG 987 PQ', 'Peugeot', '208', 2023, 'Azul', 'disponible', '', 0, 0, 31000, { valorSemanal: 320000 }),
  ];
  const payments = [];
  let n = 0;
  const pago = (carId, choferId, dias, monto, metodo, tipo) => payments.push({ id: 'pp' + (++n), carId, choferId, fecha: haceDias(dias), monto, tipo: tipo || 'alquiler', metodo: metodo || 'transferencia', depositado: dias > 7, ...(tipo === 'cuota' ? { cotizacionDia: 1200, cotizacionDiaNombre: 'Dólar blue' } : {}) });
  // Martín: al día. Lucía: debe una semana. Jorge: debe dos. Carla: financiado al día.
  for (let s = 0; s <= 9; s++) pago('pc1', 'pd1', 63 - s * 7, 300000, s % 2 ? 'efectivo' : 'transferencia');
  for (let s = 0; s <= 3; s++) pago('pc2', 'pd2', 35 - s * 7, 280000, 'mercadopago');
  for (let s = 0; s <= 15; s++) pago('pc3', 'pd3', 120 - s * 7, 260000);
  for (let s = 0; s <= 7; s++) pago('pc4', 'pd4', 50 - s * 7, 250, 'transferencia', 'cuota');
  const gastos = [
    { id: 'pg1', carId: 'pc5', categoria: 'repuestos', fecha: haceDias(4), costo: 185000, proveedor: 'Taller El Rápido', descripcion: 'Embrague completo' },
    { id: 'pg2', carId: 'pc1', categoria: 'combustible', fecha: haceDias(10), costo: 25000, descripcion: 'Carga de GNC' },
    { id: 'pg3', carId: '', categoria: 'otro', fecha: haceDias(12), costo: 60000, descripcion: 'Alquiler de cochera' },
  ];
  const mantenimientos = [
    { id: 'pm1', carId: 'pc3', item: 'aceite', label: 'Cambio de aceite y filtro', tipo: 'preventivo', fecha: haceDias(30), km: 135000, costo: 95000, checklist: [] },
    { id: 'pm2', carId: 'pc1', item: 'frenos', label: 'Pastillas de freno', tipo: 'correctivo', fecha: haceDias(55), km: 80000, costo: 70000, checklist: [] },
  ];
  const multas = [
    { id: 'pmu1', carId: 'pc2', numeroActa: 'Q12345678', fecha: haceDias(20), tipoInfraccion: 'velocidad', organismo: 'CABA', monto: 120000, fechaLimitePago: enDias(10), estado: 'pendiente', choferId: 'pd2', puntos: 5 },
  ];
  const recordatorios = [
    { id: 'pr1', texto: 'Llamar al seguro por la renovación del Onix', fecha: enDias(1), hecho: false },
  ];
  return { cars, drivers, payments, gastos, mantenimientos, multas, recordatorios };
}

// ---------- Base de datos falsa ----------
function valor(fila, campo) {
  const m = /^data->>(.+)$/.exec(campo);
  if (m) return fila.data && fila.data[m[1]] != null ? String(fila.data[m[1]]) : null;
  return fila[campo];
}
function crearDB() {
  const ahora = () => new Date().toISOString();
  const tablas = {};
  const datos = datosEjemplo();
  Object.keys(datos).forEach(t => { tablas[t] = datos[t].map(x => ({ id: x.id, data: x, updated_at: ahora() })); });
  tablas.profiles = [{ id: USUARIO_PRACTICA.id, email: USUARIO_PRACTICA.email, rol: 'admin', activo: true, created_at: ahora() }];
  tablas.audit_log = [];
  return { tablas, ahora };
}

export function crearSbPractica() {
  const db = crearDB();
  let seq = 0;
  const tabla = t => (db.tablas[t] = db.tablas[t] || []);
  function consulta(t) {
    const q = { op: 'select', filtros: [], orden: null, desde: 0, hasta: null, lim: null, fila: null, unico: false, devolver: false };
    const pasa = f => q.filtros.every(([tipo, c, v]) => {
      const x = valor(f, c);
      if (tipo === 'eq') return String(x) === String(v);
      if (tipo === 'gte') return x != null && String(x) >= String(v);
      if (tipo === 'like') return x != null && new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(String(x));
      return true;
    });
    const ejecutar = () => {
      const T = tabla(t);
      if (q.op === 'insert' || q.op === 'upsert') {
        const filas = [].concat(q.fila).map(r => Object.assign({ created_at: db.ahora() }, r, r.id == null ? { id: ++seq } : {}, 'data' in r && !r.updated_at ? { updated_at: db.ahora() } : {}));
        filas.forEach(r => { const i = T.findIndex(x => x.id === r.id); if (i >= 0 && q.op === 'upsert') T[i] = Object.assign({}, T[i], r); else T.push(r); });
        return { data: q.devolver ? filas.map(r => ({ id: r.id, updated_at: r.updated_at })) : null, error: null };
      }
      if (q.op === 'update') {
        const filas = T.filter(pasa);
        filas.forEach(f => Object.assign(f, q.fila, 'data' in q.fila && !q.fila.updated_at ? { updated_at: db.ahora() } : {}));
        return { data: q.devolver ? filas.map(r => ({ id: r.id, updated_at: r.updated_at })) : null, error: null };
      }
      if (q.op === 'delete') { db.tablas[t] = T.filter(f => !pasa(f)); return { data: null, error: null }; }
      let filas = T.filter(pasa).map(f => Object.assign({}, f));
      if (q.orden) { const [c, asc] = q.orden; filas.sort((a, b) => (String(a[c]) > String(b[c]) ? 1 : String(a[c]) < String(b[c]) ? -1 : 0) * (asc ? 1 : -1)); }
      const total = filas.length;
      if (q.hasta != null) filas = filas.slice(q.desde, q.hasta + 1);
      if (q.lim != null) filas = filas.slice(0, q.lim);
      if (q.unico) return { data: filas[0] || null, error: null };
      return { data: filas, error: null, count: total };
    };
    const o = {
      select: () => { if (q.op !== 'select') q.devolver = true; return o; },
      insert: r => { q.op = 'insert'; q.fila = r; return o; },
      upsert: r => { q.op = 'upsert'; q.fila = r; return o; },
      update: r => { q.op = 'update'; q.fila = r; return o; },
      delete: () => { q.op = 'delete'; return o; },
      eq: (c, v) => { q.filtros.push(['eq', c, v]); return o; },
      gte: (c, v) => { q.filtros.push(['gte', c, v]); return o; },
      like: (c, v) => { q.filtros.push(['like', c, v]); return o; },
      order: (c, opt) => { q.orden = [c, !(opt && opt.ascending === false)]; return o; },
      range: (a, b) => { q.desde = a; q.hasta = b; return o; },
      limit: n => { q.lim = n; return o; },
      maybeSingle: () => { q.unico = true; return Promise.resolve(ejecutar()); },
      single: () => { q.unico = true; return Promise.resolve(ejecutar()); },
      then: (ok, mal) => Promise.resolve().then(ejecutar).then(ok, mal),
    };
    return o;
  }
  // Archivos: quedan en memoria y se ven con un link temporal del navegador.
  const archivos = new Map();
  const bucket = {
    upload: async (ruta, blob) => { archivos.set(ruta, blob); return { data: { path: ruta }, error: null }; },
    remove: async rutas => { rutas.forEach(r => archivos.delete(r)); return { data: null, error: null }; },
    download: async ruta => (archivos.has(ruta) ? { data: archivos.get(ruta), error: null } : { data: null, error: { message: 'No existe en el modo práctica' } }),
    createSignedUrl: async ruta => ({ data: archivos.has(ruta) ? { signedUrl: URL.createObjectURL(archivos.get(ruta)) } : null, error: null }),
    list: async () => ({ data: [], error: null }),
  };
  const canal = { on: () => canal, subscribe: () => canal };
  const sesion = { access_token: 'practica', user: USUARIO_PRACTICA };
  return {
    from: consulta,
    rpc: async () => ({ data: null, error: null }),
    channel: () => canal,
    removeChannel: () => {},
    storage: { from: () => bucket },
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      refreshSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { salirPractica(); return { error: null }; },
      signInWithPassword: async () => ({ error: { message: 'Estás en el modo práctica' } }),
      updateUser: async () => ({ error: { message: 'En el modo práctica no se cambian contraseñas' } }),
      resetPasswordForEmail: async () => ({ error: { message: 'Estás en el modo práctica' } }),
    },
  };
}
