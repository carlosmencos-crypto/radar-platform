# Registro de QA y bloqueos — Superadministrador

Fecha de corte: 2026-09-18 UTC
Rama: `superadmin/v70-national-qa`
Base: `579caa8a58e5f8b7368a3500e723c9fc7d0401a2`

## Estado verificable

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Golden remoto/commit | Aprobado | Rama Golden coincide exactamente con el SHA autorizado |
| Auditoría administrador anterior | Aprobado | Site separado, versión 4; no está en el repositorio principal |
| Auditoría Supabase | Aprobado, solo lectura | Proyecto principal inspeccionado sin DDL ni escrituras |
| Matriz de roles y arquitectura | Aprobado para implementación | `ARCHITECTURE.md` y `ROLE_MATRIX.md` |
| TypeScript | Aprobado local | `npm run typecheck`, sin errores |
| Lint | Aprobado local | `npm run lint`, 0 warnings y 0 errores |
| Pruebas unitarias | Aprobado local | 67/67, incluye contrato del control-plane |
| Build | Aprobado local con warning no bloqueante | Vite produjo `dist`; chunk JS >500 kB |
| Smoke 340 rutas | Aprobado local | 5,780/5,780 pares, 340/340 municipios, 0 cruces |
| Auditoría de bundle | Aprobado local | 0 sourcemaps, secretos, Campaign Vault privado o PII detectada |
| Sintaxis migración PostgreSQL 17 | Aprobado local | Parser nativo PostgreSQL 17: `SQL_PARSE_OK` |
| Migración SQL en rama QA | Bloqueado | El proyecto solo tiene `main`; Supabase cotiza la rama QA en USD 0.01344/h y requiere confirmación |
| Pruebas negativas RLS/roles | Bloqueado | Requieren rama Supabase QA y usuarios de prueba |
| Edge Function QA | Bloqueado | Depende de migración QA y secretos de esa rama |
| Preview web QA | Bloqueado | Depende del backend QA desplegado |
| Producción | Prohibido | Requiere QA completo y autorización expresa de Carlos |

## Bloqueos que no deben ocultarse

1. La migración Pulso aún no existe en la base remota principal.
2. Ningún usuario actual tiene `app_metadata.platform_role`; no hay una identidad administrativa válida para el nuevo control-plane.
3. No hay rama Supabase QA, Edge Functions desplegadas ni cuenta administrativa con MFA verificado.
4. La protección de contraseñas filtradas está desactivada en Auth.
5. `radar_authorized_voter_communities(text)` conserva un warning `SECURITY DEFINER`; debe revisarse antes de integración.

Nada de lo anterior se considera “funcionando” hasta probarlo en QA.
