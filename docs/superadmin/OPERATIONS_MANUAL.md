# Manual operativo — RADAR Superadministrador

Este manual corresponde a la rama `superadmin/v70-national-qa`. Ningún paso autoriza publicar en producción, modificar `main`, reescribir el Golden V70 ni abrir datos al cliente.

## 1. Acceso administrativo

1. El usuario debe existir en Supabase Auth.
2. `app_metadata.platform_role` debe contener uno de: `super_admin`, `data_ops`, `qa`, `support`, `commercial_ops`, `rtd_ops`.
3. `public.profiles` debe estar activo y tener el mismo `platform_role`.
4. Excepto `super_admin`, debe existir al menos un `admin_vault.operator_scopes` activo con territorio y permisos explícitos.
5. La cuenta debe tener TOTP verificado. La consola eleva la sesión a AAL2 y la Edge Function vuelve a comprobar el claim `aal`.

Nunca se usa `user_metadata` para autorizar. El `service_role` solo se configura como secreto del backend de la Edge Function.

### Principio de operación de la consola

- La interfaz usa la identidad canónica RADAR V70: logotipo oficial, sidebar grafito, encabezado blanco, marfil, azul petróleo y morado electoral.
- Los identificadores internos de campaña, contrato, lote, medición y usuario no se solicitan manualmente. El operador selecciona objetos legibles y la consola envía sus identificadores al backend.
- Las operaciones de alta y publicación se presentan como asistentes con contexto, alcance, motivo y confirmación.
- Los contadores del resumen se derivan únicamente del snapshot administrativo. Las muestras visuales aisladas se marcan expresamente como `DATOS QA` y no representan avance nacional.

## 2. Orden de despliegue QA

1. Crear una rama de base Supabase de desarrollo; no usar `main`.
2. Aplicar en orden todas las migraciones posteriores al Golden. La migración de Pulso `20260918183000` debe preceder a `20260918183100_superadmin_national_control_plane_v1.sql`.
3. Ejecutar advisors de seguridad y rendimiento.
4. Desplegar `radar-admin-api` con `verify_jwt = true`.
5. Configurar `RADAR_ADMIN_ALLOWED_ORIGINS` únicamente con el dominio QA y localhost autorizado.
6. Configurar el frontend QA con la URL y publishable key de la rama, nunca con secretos.
7. Crear un `super_admin` QA y alinear su perfil. En el primer ingreso a `/admin`, la pantalla guía el enrolamiento TOTP y eleva la sesión a AAL2.
8. Registrar cada ejecución en `admin_vault.qa_runs`. Solo después de todos los gates puede registrarse un deployment `READY`.

## 3. Vertical 0509 + segundo municipio

- Municipio piloto: `0509`, Puerto San José, Escuintla.
- Aislamiento: `1901`, Zacapa, Zacapa.
- 0509 conserva la campaña real existente; 1901 se usa para probar estados vacíos y denegaciones. No se copian filas entre territorios.
- Crear operadores separados con scopes 0509 y 1901. Cada token debe fallar al consultar o mutar el territorio opuesto.

## 4. Exclusividad y alta de campaña

1. En `Exclusividad comercial`, seleccionar municipio, organización autorizada, vigencia, referencia y motivo.
2. Intentar una segunda reserva solapada. PostgreSQL debe rechazarla por la restricción GiST, no por la UI.
3. En `Municipios y campañas`, crear la campaña seleccionando una reserva `RESERVED` o `ACTIVE`; la consola resuelve internamente municipio y organización.
4. Activar la campaña únicamente cuando el contrato lo permita.

No editar directamente `public.campaigns` para evitar el control contractual.

## 5. Publicación de Data Vault

1. Usar `Nueva carga`, seleccionar dataset, alcance territorial y fuente registrada, y cargar CSV o JSON. La API calcula SHA-256 y guarda cada archivo en una ruta UUID inmutable de `radar-admin-staging`; `publication_batches` y `dataset_releases` conservan el historial de versiones.
2. Revisar `diff_summary`, `validation_summary` y `publication_issues`.
3. Corregir cualquier `ERROR` o `BLOCKER`; un lote con bloqueos no puede aprobarse.
4. QA transiciona `PREVALIDATED → APPROVED` con motivo.
5. QA publica `APPROVED → PUBLISHED`. Esto crea un `dataset_release` incremental y mueve el puntero vigente.
6. Para revertir, seleccionar release actual y release de restauración. El rollback crea una versión adicional; no sobrescribe ni elimina la anterior.

El preview estructural CSV no sustituye una validación semántica del esquema. Vacíos permanecen vacíos; no se imputan ni se convierten en cero.

## 6. Pulso Electoral

Cada borrador requiere folio, elección, territorio, fechas de campo, muestra, metodología, ficha técnica, `source_id`, fuente, versión y resultados almacenados.

- `ALCALDIA`: `MUNICIPALITY`, mismo `municipality_code`.
- `DIP_DIST`: `DEPARTMENT`, mismo `department_code`.
- `PRESIDENTE`, `DIP_NAC`, `PARLACEN`: `NATIONAL`, `country_code = GT`.

Flujo: `BORRADOR → PREVALIDADA → APROBADA → PUBLICADA`. Una versión aprobada o publicada es inmutable. La gráfica cliente recibe los valores almacenados; no los recalcula.

El operador captura esos campos mediante el asistente `Nueva encuesta`. La consola construye la medición y sus resultados; no se admite pegar JSON en la interfaz.

## 7. Usuarios y revocación

- Solo `super_admin` invita, asigna rol/scopes, suspende o reactiva.
- Suspender desactiva el perfil, desactiva scopes, revoca sesiones y bloquea el usuario en Auth.
- El administrador no puede suspenderse a sí mismo por esta función.
- Verificar que el usuario revocado no pueda reutilizar un refresh token.

## 8. Soporte

Abrir una sesión con ticket, municipio o campaña, motivo, modo y expiración. Duración máxima: ocho horas. Soporte conserva su identidad; no existe login como usuario ni suplantación. Cerrar la sesión al terminar.

## 9. Gates obligatorios antes de solicitar aprobación

- Build, lint, typecheck y pruebas unitarias en verde.
- Smoke test de las 340 rutas.
- Pruebas negativas de municipio, departamento, campaña, rol y AAL1.
- Tres pruebas Pulso: municipal, departamental y nacional.
- Reserva solapada rechazada por base.
- Publicación con blocker rechazada; publicación limpia y rollback verificados.
- Storage privado y versionado aplicativo verificado: rutas inmutables, `upsert=false`, SHA-256 y releases numerados.
- Advisors revisados sin hallazgos críticos nuevos.
- Preview del administrador disponible solo en QA.

## 10. Referencias Supabase verificadas

- MFA y Assurance Level: https://supabase.com/docs/guides/auth/auth-mfa
- Datos de usuario y `app_metadata`: https://supabase.com/docs/guides/database/postgres/row-level-security
- Edge Functions y secretos: https://supabase.com/docs/guides/functions/secrets
- Vistas `security_invoker`: https://supabase.com/docs/guides/database/postgres/row-level-security#views
- Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Changelog: https://supabase.com/changelog
