# LBM Portal — Plan de Implementación Técnica

Sistema interno + portal de cliente para Legacy Building Media (LBM), construido sobre los datos de ClickUp. Reemplaza Make.com como capa de automatización y agrega un portal de cliente, dashboards operativos, y tracking de pagos a freelancers.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend / App | Next.js 15 |
| Hosting | Netlify (Functions + Cron) |
| Base de datos | Neon Postgres |
| ORM | Drizzle ORM |
| Autenticación | BetterAuth (multi-tenant: admin / account_manager / client) |
| Fuente de datos | ClickUp API v2 |
| Video review | Frame.io API v4 |
| Publicación social | Vista Social API |
| Notificaciones | Meta WhatsApp Cloud API + SMS de respaldo (Twilio u otro) |
| Email | Resend (magic links) |

## Decisiones de arquitectura

- **Polling sobre webhooks.** Cron de Netlify cada 5 min lee ClickUp y escribe a Neon. Los webhooks de ClickUp no garantizan entrega; un sync periódico + reconciliación es más simple y estable que mantener dos sistemas (webhook + reconciliación de respaldo).
- **Writes son siempre directos e inmediatos.** Aprobación de cliente, publicación a Vista Social, cualquier acción del usuario llama directo al API correspondiente — nunca espera al cron.
- **Snapshot diario de métricas.** Tabla `daily_metrics` que persiste cálculos (ciclo promedio, first-pass rate, etc.) cada día. Sin esto no hay manera de mostrar tendencias ("vs. semana pasada") de forma confiable — ClickUp no guarda historial de métricas computadas, solo historial de status.
- **Identidad de clientes por ID, nunca por nombre.** El nombre del cliente vive en el dropdown `Client Name (AM)` de ClickUp. Cada opción tiene un UUID estable (ver Apéndice A). La tabla `clients` en Neon mapea contra ese UUID, no contra el texto — si alguien renombra la opción en ClickUp, el mapping no se rompe. Nunca hacer matching por string de nombre.
- **Reutilizar campos existentes de ClickUp, no crear nuevos donde ya existen.** El workspace de LBM ya tiene:
  - `Captions` (text) — la app lee/escribe directo aquí.
  - `Publishing Status` (dropdown: Draft / In Queue / Published / Error) — construido para el Make.com actual; la app lo reutiliza para el write-back de publicación.
  - `CLIENT APPROVAL` (dropdown: APPROVED / REQUESTED CHANGES) — campo independiente del `status` del pipeline. Las dos cosas se actualizan en escrituras separadas pero atómicas.
  - `Video Level (AM)` (dropdown: Level 1/2/3, Spanish, Promo, Thumbnail, Long Form) — determina la tarifa de pago al editor freelance.
- **Links de Frame.io directos, no acortados.** El API de Frame.io expone View URL (visualización) y Original Download URL (descarga) directamente — la app construye sus propios links en vez de depender de un acortador externo.
- **Retiro de Make.com.** Toda la lógica de publicación a Vista Social que hoy vive en Make se reconstruye nativamente en la app.
- **Sin Twilio para WhatsApp.** Meta Cloud API directo — gratis hasta 1,000 conversaciones/mes, suficiente para 10-20 clientes. Twilio (o equivalente) solo entra como canal de SMS de respaldo en el escalamiento de 24h.

---

## Pipeline de producción (ClickUp — estado actual)

12 etapas identificadas en el workspace de LBM:

| # | Etapa (status ClickUp) | Significado | Qué computar |
|---|---|---|---|
| 1 | Backlog / Not Ready | Sin brief completo | Volumen pendiente |
| 2 | Not Assigned | Brief listo, sin editor | Tiempo en estado = cuello de asignación |
| 3 | In Progress (Editor) | Editor trabajando | Tiempo en estado = productividad editor |
| 4 | In Progress (Corrections) | Devuelto para corregir | ⚑ Bottleneck crítico — impacta first-pass rate |
| 5 | Quality Control – TC / QC | Revisión interna (editor/QC) | Filtro previo a revisión del AM |
| 6 | **QC Final – AM** | Última revisión del AM antes del cliente | Tiempo aquí = bottleneck del AM, no del editor |
| 7 | For Client Review | Esperando `CLIENT APPROVAL` | Tiempo aquí = responsividad del cliente |
| 8 | Ready to be Posted | Aprobado, listo para publicar | Buffer de publicación |
| 9 | Posted in Socials | Publicado — ciclo completo | Meta: todo lo activo llega aquí |
| 10 | Not Posted — Discarded | Descartado sin publicar | Tasa de descarte = ineficiencia |
| 11 | Archived | Cerrado | — |
| — | (paralelo) Film Sessions | Sesiones de filmación — **no existe aún, construir en Fase 11** | Horas reportadas, payout por sesión |

**Máquina de estados de aprobación (Fase 4 — confirmar con LBM antes de construir):**

```
Cliente hace clic "Approve"
  → status: siguiente etapa del pipeline
  → CLIENT APPROVAL: "APPROVED"

Cliente hace clic "Request changes"
  → CLIENT APPROVAL: "REQUESTED CHANGES"
  → status: "QC Final - AM"   ⚠ ASUNCIÓN A VALIDAR
       (el AM hace triage: decide si descarta o reenvía a "In Progress (Corrections)")
```

⚠️ **Pendiente de confirmar con LBM antes de implementar esta parte:** ¿"Request changes" del cliente realmente debe enrutar a `QC Final - AM` para que el AM decida, o va directo a `In Progress (Corrections)`? El comentario original de LBM fue: *"Video is discarded or goes back to AM who reviews and pushes back to Editors to fix"* — esto sugiere el AM siempre interviene primero, pero no especifica el status intermedio exacto.

---

## Schema de datos (Neon Postgres / Drizzle)

```
users
  id, email, role (admin | account_manager | client), name, created_at

clients
  id (uuid interno — fuente de verdad)
  name                          -- display name en el portal
  clickup_option_id             -- UUID de la opción en el dropdown "Client Name (AM)" — NUNCA usar el texto
  type                          -- 'retainer' | 'one_time'
  show_calendar                 -- boolean, definido al crear el cliente
  monthly_quota                 -- nullable, solo retainer
  frameio_project_id
  vistasocial_profile_ids       -- array
  whatsapp_number
  branding_config               -- json: logo, colores
  created_at

client_users
  client_id, user_id, is_primary_contact (boolean)
  -- solo is_primary_contact recibe notificaciones (WhatsApp, recordatorios, escalamiento)
  -- los demás usuarios del mismo cliente solo tienen acceso de lectura al portal

editors
  id, clickup_user_id, name, active

editor_rate_card
  id, video_level_option_id     -- mapea a las opciones de "Video Level (AM)"
  rate_amount, editor_id_override (nullable)

videographers
  id, clickup_user_id, name, active

videographer_rate_card
  id, videographer_id, rate_per_session, rate_per_day

film_sessions
  id, clickup_task_id, videographer_id, client_id
  date, hours_reported
  eod_report_url                -- link a Frame.io (video o audio del reporte diario)
  status

portal_events
  id, client_id, user_id, video_task_id
  event_type                    -- 'login' | 'video_viewed' | 'video_watched_full' | 'comment' | 'invite_sent'
  channel                       -- 'whatsapp' | 'email' | 'portal' (para response-time tracking)
  created_at

daily_metrics
  date
  active_videos, cycle_time_avg, first_pass_rate, discard_rate
  -- + breakdown por editor y por cliente en tablas relacionadas o json

video_cache                     -- espejo local de tareas ClickUp relevantes (sync cada 5 min)
  clickup_task_id, client_id, editor_id, status, client_approval
  video_level, caption, publishing_status
  frameio_asset_id, vistasocial_post_id
  last_synced_at
```

---

## Fases de implementación

### Fase 0 — Esqueleto desplegable *(nuevo — ver nota)*
- Setup Next.js 15 + Netlify, variables de entorno, estructura de carpetas
- Neon + Drizzle: schema inicial, migraciones
- Conexión ClickUp API: lectura de una lista, vista read-only de tareas activas filtradas por AM
- Deploy funcional en Netlify — sin auth, sin cron, sin escrituras
- **Objetivo**: software corriendo en producción antes de agregar complejidad

### Fase 1 — Autenticación & sync foundation
- BetterAuth: magic link para admins/AMs, token seguro para clientes, roles
- **Identidad de clientes**: tabla `clients` mapeada a `clickup_option_id`. Pantalla de admin para vincular cliente ↔ opción de dropdown ↔ proyecto Frame.io ↔ perfiles Vista Social
- Cron de sync cada 5 min, caché en `video_cache`, indicador de staleness en UI
- Vista base protegida: lista de proyectos activos filtrada por AM

### Fase 2 — Dashboard CEO
- Métricas de pulso: videos activos, ciclo promedio, first-pass rate, descarte
- Pipeline visual (funnel) con conteo y tiempo promedio por etapa, incluyendo `QC Final - AM` como bottleneck propio del AM
- Tabla de editores: videos nuevos, correcciones por video, ciclo individual, tiempo promedio de edición
- Benchmark diario por editor (~1 video nuevo + 2 correcciones/día) con desviación visible
- Sistema de alertas: +48h sin asignar, +72h sin respuesta cliente, correcciones >40%
- Filtros por período / editor / cliente
- **Snapshot diario** (`daily_metrics`) para habilitar tendencias

### Fase 3 — Dashboard Account Manager
- Lista de acciones del día ordenada por urgencia (no por fecha ni cliente)
- Tarjetas de proyecto con acción rápida (asignar editor, WhatsApp, ver en ClickUp)
- Progreso mensual por cliente (barra: entregados vs. comprometidos)
- Métricas personales: ciclo propio, first-pass rate propio, tiempo de respuesta de sus clientes
- Log de entregas con versiones y tiempos

### Fase 4 — Portal de cliente (mobile-first)
- Login por magic link/token
- **Multi-usuario por cliente**: 2-3 personas pueden acceder; solo `is_primary_contact` recibe notificaciones
- Experiencia retainer: contador mensual (ej. 5/8), feed de pendientes, recently reviewed
- Experiencia one-time: milestones (Filming → Editing → Your review → Final delivery)
- Flujo de aprobación (ver máquina de estados arriba) — escribe `status` + `CLIENT APPROVAL`
- Comentarios al aprobar/rechazar → se crean en ClickUp
- Feed preview: video como se verá publicado (Reel/TikTok/Short) + caption juntos, una sola ronda de aprobación
- Notificación al AM cuando el cliente actúa
- Notificación de video publicado con link directo para reenviar (WhatsApp, etc.)
- Branding configurable, diseño mobile-first

### Fase 5 — Integración Frame.io
- Conexión API, listado de assets por proyecto
- Player embebido — cliente revisa sin salir del portal
- Sync de comentarios en dos vías: Frame.io ⇄ ClickUp ⇄ Portal (un solo hilo)
- Comentarios con timestamp desde el portal (API de Frame.io soporta `timestamp` en `createComment`)
- Vinculación de registros: cada video muestra su ClickUp task + Frame.io asset con estado en vivo
- ⚠️ Alta complejidad: Frame.io v4 y ClickUp tienen modelos de threading distintos — plan de sync detallado antes de implementar

### Fase 6 — Publishing calendar & client activity
- Calendario mensual: publicado / scheduled / awaiting review
- **Toggle por tipo de cliente**: se activa/desactiva según `clients.show_calendar`, configurado al crear el cliente
- Activity tracking → tabla `portal_events`: video visto, % reproducción, login, comentario, invite enviado
- Timeline de actividad para el AM (Viewed / Not opened / Watched 100%)
- Badges de estado de cliente en el review queue del admin

### Fase 7 — WhatsApp notifications & escalamiento
- Meta WhatsApp Cloud API directo (sin Twilio para el canal principal)
- Templates aprobados: notificación de revisión, recordatorio, aprobación
- Trigger: WhatsApp al cliente cuando video entra a "For Client Review"
- **Escalamiento de 24h**: si `CLIENT APPROVAL` sigue vacío 24h después → WhatsApp + SMS al cliente. Si sigue sin respuesta después de un período adicional → notificación al AM
- SMS de respaldo (proveedor a definir) solo para el escalamiento
- Config por cliente: activar/desactivar canal, gestionar números

### Fase 8 — Publicación a Vista Social (reemplaza Make.com)
- Publishing queue: videos aprobados pendientes de publicar
- Flujo de captions: lee el campo existente `Captions` de ClickUp, pre-llena el formulario, marca en amber si está vacío, contador de caracteres por red. Lo que el AM edite se escribe de vuelta al mismo campo
- Formulario de publicación: caption editable, perfiles destino (desde `clients.vistasocial_profile_ids`), fecha/hora
- Pipeline de media: descarga del asset final desde Frame.io → carga a Vista Social
- Creación del post (inmediato o programado) vía Vista Social API
- Write-back a ClickUp: reutiliza `Publishing Status` (Draft/In Queue/Published/Error) + `status` → "Posted in Socials" + comentario con link al post
- ⚠️ Verificar con LBM que su plan de Vista Social incluye el API add-on. El API no cubre X/Twitter — esa red queda manual si aplica

### Fase 9 — Onboarding centralizado de clientes & Gameplan
- Formulario de alta (admin): nombre, tipo (retainer/one-time), perfiles Vista Social, proyecto Frame.io, `show_calendar`
- La app agrega el cliente al Master Client List de ClickUp vía API
- La app agrega la nueva opción al dropdown `Client Name (AM)` vía API de custom field options
- La app clona la lista-plantilla de onboarding/roadmap dentro del folder correspondiente (una lista por cliente)
- Envío de magic link de bienvenida al completar el alta
- Gameplan: cuando el AM marca un Film Session como listo, la app envía al cliente el **link** del Google Doc del gameplan (WhatsApp/portal) — sin renderizar contenido

### Fase 10 — Payout tracking: editores freelance
- Rate card por `Video Level (AM)`, con overrides por editor individual
- Cálculo de payout: suma de videos completados por editor/nivel en un período
- Reporte exportable (CSV) para el CEO — sin procesamiento de pagos, LBM paga manualmente
- Alimenta la métrica "Cost / finished minute" del dashboard CEO
- **Fuera de alcance**: portal para editores, auto-asignación/claim, ratings, pagos automatizados (Stripe Connect) — eso es Tier 2 / roadmap

### Fase 11 — Tracking de filmación & End of Day Report
- Nueva lista `Film Sessions` en ClickUp (vía API): videógrafo, cliente, fecha, horas reportadas
- End of Day Report: el videógrafo sube su reporte (video o audio) a una carpeta de Frame.io de la sesión; el link queda en la tarea
- Rate card de videographers (independiente del de editores): por sesión/día, con overrides
- Cálculo de payout por sesión, mismo patrón que Fase 10
- Dashboard de filmación en el Dashboard CEO: gasto total por período, desglosado por videógrafo y cliente
- ⚠️ Confirmar con LBM el formato exacto del campo de horas reportadas antes de construir el rate card

### Fase 12 — Pulido, capacitación & soporte
- Ajustes UX basados en feedback de uso real
- Capacitación para CEO y AMs
- Documentación de operación (admin) y de uso (cliente)
- Soporte post-lanzamiento

---

## Apéndice A — Estructura real de campos ClickUp (referencia)

Del análisis de una tarea real del workspace (`86agx0b2v`):

```
custom_fields relevantes:
  CLIENT APPROVAL          drop_down  [APPROVED, REQUESTED CHANGES]      -- independiente de status
  Captions                 text                                          -- ya existe, no crear
  Publish Date              date
  Publishing Status        drop_down  [Draft, In Queue, Published, Error] -- ya existe, construido para Make.com actual
  QUALITY CHECK (Somu)     drop_down  [QC NOT APPROVED, NOT REVIEWED, QC APPROVED]
  Ready to Publish?        checkbox
  Updated Frame Link (Editor)  url    -- link de Frame.io
  Video Level (AM)         drop_down  [Level 1, Level 2, Level 3, Spanish, Promo, Thumbnail, Long Form]  -- determina pago al editor
  Account Manager (AM)     users (single_user)
  Client Name (AM)         drop_down  -- 23 opciones, cada una con UUID estable. NUNCA mapear por texto, siempre por option id.
```

Ejemplo de opciones de `Client Name (AM)` con su UUID (hay 23 en total):

```
{ "id": "8e102fb8-be52-4bd2-b568-e41506fe7806", "name": "Adam" }
{ "id": "2663293d-e069-474f-a006-245ccdd41c34", "name": "Volvi" }
{ "id": "9d7b65c4-cfd9-483c-8d9a-b322c106dc23", "name": "Kristina" }
... (ver dump completo de custom_fields_original en el workspace para la lista completa)
```

El campo `value` de un dropdown en la tarea es el **índice** dentro de `type_config.options` (ordenado, no alfabético salvo que `sorting: "name_asc"`) — no es el `id`. Al sincronizar, resolver siempre `options[value].id` y guardar ese id en `clients.clickup_option_id`, no el índice ni el nombre.

---

## Preguntas abiertas pendientes de LBM

1. ¿"Request changes" del cliente enruta a `QC Final - AM` para triage, o directo a `In Progress (Corrections)`? *(bloqueante para Fase 4)*
2. Formato exacto del campo de horas reportadas por videographers (¿numérico simple o desglose por bloques?). *(bloqueante para Fase 11)*
3. ¿El plan actual de Vista Social de LBM incluye el API add-on? *(bloqueante para Fase 8)*
4. ¿El plan actual de Frame.io de LBM incluye acceso API completo? *(bloqueante para Fase 5)*
5. Plantilla actual del Google Doc de Gameplan — confirmar en qué campo de la tarea de Film Session vive el link. *(bloqueante para Fase 9)*
6. Rate card real de pago por Video Level (montos) y por sesión de videographer. *(bloqueante para Fase 10/11)*

---

## Notas de revisión

- **Fase 0 agregada**: separa la fundación técnica (Next.js + Neon + ClickUp read-only) del trabajo de auth y cron, para tener software desplegado antes de agregar complejidad.
- **Staleness indicator**: el cron puede fallar; la UI debe mostrar `last_synced_at` cuando los datos tienen más de X minutos.
- **Frame.io sync (Fase 5)**: marcado como alta complejidad — requiere un diseño de sync detallado antes de implementar, no solo llamadas API.
