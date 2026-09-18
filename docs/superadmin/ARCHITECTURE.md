# Arquitectura de la consola nacional

## Límites

- Una plataforma multi-tenant; no existen 340 aplicaciones, esquemas ni copias del dashboard.
- El dashboard municipal Golden no se rediseña ni comparte navegación con la consola.
- El frontend nunca recibe `service_role`, DPI, padrón crudo, CRM completo ni documentos privados por defecto.
- Data Vault oficial y Campaign Vault privado siguen separados.
- Vacío no es cero; fuente, periodo y universo se conservan sin imputación.

## Flujo

1. El usuario inicia sesión con Supabase Auth.
2. La consola exige rol administrativo en `app_metadata`, perfil activo y AAL2.
3. El frontend llama a una Edge Function con el JWT del usuario.
4. La función valida usuario, rol, AAL2, alcance y permiso específico.
5. Solo entonces usa `service_role` en servidor para consultar agregados o ejecutar una función SQL privilegiada.
6. Toda mutación incluye motivo y escribe un evento de auditoría con antes/después.

## Esquemas

- `public`: catálogos multi-tenant y RPC existentes del producto.
- `data_vault`: datos oficiales, linaje y versiones publicadas.
- `campaign_vault`: datos privados por campaña, nunca expuestos globalmente a soporte.
- `admin_vault`: contratos, alcances de operador, lotes de publicación, validaciones, auditoría, soporte y salud operativa. No se expone directamente al Data API.

## Publicación versionada

Estados permitidos:

`UPLOADED → PREVALIDATED → APPROVED → PUBLISHED`

Salidas laterales:

- `REJECTED` desde prevalidación/aprobación.
- `ROLLED_BACK` desde publicación, creando una versión nueva que apunta al release anterior; nunca se borra ni sobrescribe el release publicado.

Cada lote conserva `source_id`, periodo, alcance, hashes, diferencias, errores, actor y motivo. El frontend solo consume el release marcado como vigente.

## Pulso

- Alcaldía: municipio exacto.
- Diputación distrital: departamento exacto.
- Presidencia, listado nacional y Parlacen: `country_code = GT`.
- Borradores no son visibles al cliente.
- La gráfica recibe valores aprobados; no recalcula porcentajes ni inventa faltantes.

## Soporte

Soporte abre una sesión explícita con ticket, motivo, alcance, caducidad y modo de acceso. No cambia de identidad ni suplanta silenciosamente al usuario. Los accesos excepcionales a datos privados son mínimos, temporales y auditados.

## Vertical QA

- 0509: campaña real y miembro real existentes.
- 1901: segundo municipio territorial sin campaña activa, usado para comprobar aislamiento y estados vacíos reales.
- Ninguna prueba de aislamiento escribe en producción.
