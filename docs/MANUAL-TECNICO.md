# LD Rental — Manual técnico

Para quien tenga que mantener o seguir la app. El manual de uso está dentro de la app
(Más → "Ver cómo usar la app", al pie).

## Qué es

Una app web instalable (PWA) para administrar una flota de autos alquilados a choferes:
autos, choferes, cobros, deudas, vencimientos, mantenimiento, multas, siniestros, pañol,
reportes y un portal para que cada chofer vea su cuenta.

- **Frontend:** Vite + JavaScript sin framework. Las pantallas se arman como texto HTML y
  los botones llaman funciones globales (`onclick="carForm('id')"`).
- **Base de datos y usuarios:** Supabase (Postgres + Auth + Storage + Edge Functions).
- **Publicación:** Vercel, desde la rama `main` de GitHub. Producción:
  `https://app.ldrental.com.ar` (también `ldrental-ten.vercel.app`).

## Cómo correrla en una compu

```bash
npm install
# archivo .env con los datos del proyecto de Supabase:
#   VITE_SUPABASE_URL=https://<proyecto>.supabase.co
#   VITE_SUPABASE_KEY=<clave pública anon>
npm run dev        # http://localhost:5173
npm test           # tests automáticos (vitest)
npm run build      # arma dist/
```

En Vercel, `buildCommand` es `npm test && npm run build`: si un test falla, no se publica.

## Estructura

| Carpeta / archivo | Qué hay |
|---|---|
| `src/main.js` | Entrada. Decide si cargar la app, el portal del chofer (`#/portal/...`) o la postulación (`#/postulacion`). |
| `src/app.js` | Cuelga de `window` todas las funciones que usan los botones. Las pantallas poco usadas se cargan bajo demanda (`perezoso`). |
| `src/session.js` | Login, carga inicial, cierre de sesión forzado. |
| `src/nav.js` | Pestañas y `render()`. |
| `src/state.js` | Estado en memoria `S` (colecciones) y `ui` (filtros). Clientes `sb` (Supabase) y `as` (archivos). |
| `src/data.js` | `save()` / `remove()`: guardado con control de versiones, cola sin conexión, cierre de mes, auditoría y cambios sensibles. |
| `src/memo.js` | Índices (`de(col, campo, valor)`) y memoria de cálculos. Llamar `tocarDatos()` si se cambia `S` a mano. |
| `src/calc.js` | Cuentas del negocio: deuda (`calc`), alertas, rentabilidad, mantenimiento. |
| `src/settings.js` | Ajustes. Los de `SYNC_KEYS` se comparten entre usuarios (tabla `app_settings`). |
| `src/forms/` | Formularios y pantallas de cada tema (auto, chofer, cobro, acta, etc.). |
| `src/views/` | Pestañas principales (panel, autos, choferes, cobros, más…). |
| `src/membrete.js` | Encabezado, numeración correlativa y pie de todos los PDF. |
| `src/validar.js` | DNI, CUIT, CBU, patente y teléfono. |
| `src/conflictos.js` | Junta cambios cuando dos personas editan lo mismo. |
| `src/errores.js` | Registro de errores en la tabla `app_errores`. |
| `supabase/functions/` | Funciones del servidor (ver abajo). |
| `sql/` | Scripts para crear tablas y permisos. Todos se pueden volver a correr. |
| `tests/` | Tests automáticos. |

## Datos

Cada colección es una tabla con la misma forma:

```sql
id text primary key, data jsonb, updated_at timestamptz
```

Colecciones (`COLS` en `src/constants.js`): cars, drivers, payments, gastos, proveedores,
sanciones, prospectos, inspecciones, mantenimientos, multas, depositos, siniestros,
gastosrecurrentes, recordatorios, encuestas, repuestos. Aparte: `app_settings`,
`profiles`, `audit_log`, `cajachica`, `app_errores`, `push_subscriptions`.

**Permisos (RLS):** cualquier usuario activo lee y escribe; borrar, solo administrador o
supervisor (`can_delete()`); auditoría y errores, solo el administrador los lee.

**Guardado con versión:** `save()` actualiza solo si `updated_at` no cambió desde que se
leyó. Si cambió, trae lo del servidor, junta los campos (`combinar`) y, si los dos tocaron
el mismo campo, pregunta cuál dejar.

**Mes cerrado:** `settings.mesesCerrados`. Cobros, gastos, depósitos y mantenimientos de un
mes cerrado solo los toca un administrador, y queda en la auditoría como cambio sensible.

## Funciones de Supabase

| Función | Para qué | Sin usuario |
|---|---|---|
| `portal-chofer` | Datos y pedidos del portal del chofer (link con token, límites por día). | sí |
| `postulacion` | Formulario público para sumarse (trampa anti-robots, 3 por hora por conexión). | sí |
| `gps-webhook` | Recibe posiciones del GPS (clave propia). | sí |
| `leer-documento` | Lee títulos, pólizas, facturas y comprobantes con IA (secreto `ANTHROPIC_API_KEY`). | no |
| `usuarios-admin` | Cambiar contraseñas y crear usuarios (solo administrador). | no |
| `push-diario`, `push-semanal` | Notificaciones. | tarea programada |
| `backup-semanal` | Copia semanal a Storage. | tarea programada |
| `whatsapp-resumen`, `whatsapp-webhook` | WhatsApp Business (opcional). | — |

Se publican solas al cambiar en `main` (`.github/workflows/funciones.yml`) si está el
secreto `SUPABASE_ACCESS_TOKEN` en GitHub. La configuración de cada una está en
`supabase/config.toml`.

## Seguridad

- Cabeceras en `vercel.json`: Content-Security-Policy (orígenes permitidos: Supabase,
  Google, dolarapi, argentinadatos), HSTS, nosniff, X-Frame-Options, Permissions-Policy.
  Si se agrega un servicio externo nuevo, sumarlo a `connect-src` o no va a andar.
- La clave de Supabase que va en la app es la pública (anon); la seguridad real la dan las
  políticas RLS.
- Nunca poner claves secretas en el código: van en Supabase → Edge Functions → Secrets.

## Publicar una versión

1. Trabajar en una rama, `npm test` y `npm run build`.
2. Sumar una entrada al principio de `CHANGELOG` en `src/constants.js` (la ve el usuario en
   "Novedades").
3. Pasar a `main`: Vercel publica solo. La app se actualiza sola en los celulares (service
   worker con `autoUpdate`).

## Copias de seguridad

- Manual: Más → Ajustes → Descargar copia (JSON con todas las colecciones, los ajustes
  compartidos y la caja chica). "Restaurar copia" permite **probarla** antes sin cambiar
  nada.
- Automática: `backup-semanal` guarda una copia por semana en Storage.

## Tests

`tests/*.test.js` con vitest y happy-dom. Cubren la cuenta de deuda, validaciones, montos
escritos a la argentina y la combinación de cambios. Para agregar uno: crear
`tests/<tema>.test.js`; si usa colecciones, llenar `S` y llamar `tocarDatos()`.
