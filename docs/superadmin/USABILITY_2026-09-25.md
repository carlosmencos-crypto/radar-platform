# Superadministrador RADAR — operación diaria
Fecha: 2026-09-25. Alcance de entrega: entorno QA existente.

## Cambios implementados
- Logo lateral ampliado, de 166 a 226 px.
- Navegación con nombres operativos: Datos municipales, Cargas y publicaciones, Actividad de campañas, Encuestas, Equipo RADAR, Historial de cambios.
- Indicador de 17 grupos explica presencia de información, sin confundirla con validación.
- MFA se presenta como verificación en dos pasos.
- Cerrar sesión visible en la consola.
- Formularios conservan contenido si la operación falla; error no lleva marca de éxito.
- Encuestas: filas dinámicas para todas las candidaturas/opciones; entradas numéricas entre 0 y 100.
- RTD aclara que muestra recepción e incidentes, no resultados consolidados por candidatura.

## Funciones solicitadas que aún requieren implementación y pruebas integrales
1. Clientes por campaña: invitar por nombre y correo; asignar municipio, campaña y rol; primer acceso con contraseña elegida por el usuario; estado pendiente/activo/suspendido.
2. Roles cliente actuales en base: campaign_admin, campaign_editor, campaign_viewer. Fiscales mantienen su acceso específico por asignación. El formulario administrativo actual invita personal interno, no miembros de campañas.
3. Cupo de usuarios configurable por contrato; no se ha aprobado un cupo comercial predeterminado.
4. Accesos: cambiar rol, retirar una campaña sin eliminar la cuenta, suspender, reactivar, revocar sesiones y consultar historial.
5. Disponibilidad: finalizar contrato, archivar campaña, retirar acceso y liberar municipio; nunca transferir datos privados al nuevo cliente.
6. Respaldo: verificar último backup y recuperación; respaldar también objetos Storage; copia por campaña y restauración probada. Plan Pro confirmado, pero no se verificó último backup ni PITR.
7. Demos: reinicio explícito y exclusivo del espacio demo, con confirmación y registro; conservar fuentes oficiales y configuración base.
8. Encuestas: validar publicación y consumo de todas las opciones en gráficos municipales, distritales y nacionales.
9. Recursos: biblioteca de archivos con categoría, alcance, versión, publicación y retiro.
10. RTD: consolidado por elección y territorio, revisión de actas, validación/duplicados, actualización automática, última actualización y reconexión.
11. Avisos: alcance por campaña, inicio/fin, una vez por usuario o hasta confirmación; push con permisos y dispositivo registrado.
12. Login landing: mismo directorio de usuarios de producción, con asignación de campaña verificada. Superadmin QA está conectado a una base QA distinta.
13. Cierre de sesión municipal: enlace heredado /signout-with-chatgpt identificado; requiere sustituirse por cierre real de sesión RADAR. No ejecutar cierre de sesiones del usuario como prueba.

## Evidencia de revisión
- Proyecto productivo Supabase radar: xxobbhnhxhcjkdxmjmwj, organización Pro.
- QA superadmin: djldhumkmuppzxiaontb; Netlify radar-superadmin-v70-qa.
- Cuenta de Carlos en producción tiene 340 pertenencias demo_admin y 2 campaign_admin; no debe describirse como autorización universal irrestricta.
- Base permite múltiples campaign_members y tres roles cliente; cupo comercial no definido.
- La base de backups de Supabase no incluye archivos de Storage: https://supabase.com/docs/guides/platform/backups
- Build, typecheck, 11 pruebas de control administrativo y auditoría de bundle completados.

## Orden de operación recomendado
Prioridad 1: clientes, invitaciones, permisos, cierre de sesión y recuperación.
Prioridad 2: disponibilidad comercial, reinicio demo y biblioteca de recursos.
Prioridad 3: encuestas integrales, RTD consolidado y avisos.

Mantener producto prime: lenguaje claro, jerarquía visual estable, controles relacionados dentro de cada municipio, sin añadir botones que no ejecuten acciones reales.
