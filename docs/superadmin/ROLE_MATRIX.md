# Matriz de roles y permisos

| Capacidad | super_admin | data_ops | qa | support | commercial_ops | rtd_ops | campaign_admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Resumen nacional agregado | Sí | Sí | Sí | Sí | Sí | Sí | No |
| Municipios/campañas: lectura | Sí | Sí | Sí | Alcance autorizado | Sí | Sí | Solo asignada |
| Crear/configurar campaña | Sí | No | No | No | Sí | No | No |
| Reservar/activar exclusividad | Sí | No | No | No | Sí | No | No |
| Invitar/suspender/revocar usuario | Sí | No | No | No | No | No | No |
| Data Vault: fuentes y linaje | Sí | Sí | Sí | Metadatos mínimos | No | Lectura RTD | No |
| Cargar y prevalidar | Sí | Sí | No | No | No | RTD | No |
| Aprobar publicación | Sí | No | Sí | No | No | RTD | No |
| Publicar/rollback | Sí | No | Sí | No | No | RTD | No |
| Campaign Vault: salud agregada | Sí | Sí | Sí | Alcance autorizado | No | Sí | Propia |
| Campaign Vault: contenido privado | Excepcional auditado | No | No | Sesión temporal | No | Mínimo RTD | Propia |
| Pulso: cargar borrador | Sí | Sí | No | No | No | No | No |
| Pulso: aprobar/publicar | Sí | No | Sí | No | No | No | No |
| RTD nacional | Sí | No | Sí | Diagnóstico | No | Sí | Municipio propio |
| QA/despliegue | Sí | Lectura | Sí | Lectura | No | Lectura | No |
| Auditoría completa | Sí | Propias | Sí | Propias | Propias | Propias | Propias |
| Abrir sesión de soporte | Sí | No | No | Sí | No | No | No |

Reglas transversales:

- Todo rol administrativo exige `app_metadata.platform_role`, perfil activo y MFA AAL2.
- El rol no concede alcance territorial por sí solo. `operator_scopes` limita país, departamento, municipio o campaña.
- `super_admin` no obtiene contenido privado automáticamente; debe justificar un acceso excepcional.
- Las mutaciones requieren permiso explícito y motivo; “usuario autenticado” nunca es autorización suficiente.
