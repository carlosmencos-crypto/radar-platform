# RADAR Dashboard — interfaz canónica

## Referencia aprobada

- Versión canónica: **70**.
- Fecha de aprobación: **2026-09-02**.
- Proyecto fuente privado: `radar-identidad-electoral`.
- Branch fuente: `main`.
- Commit exacto: `eb6359211867ac0a81163b0a0242ea86608da56e`.
- Tag Git inmutable: `radar-dashboard-canonical-v70`.
- Artefacto Sites V70: `appgprj_6a7170e1e86c8191b69fc31eb4b9b749`.
- Hash del artefacto fuente: `sha256:e782bbe983b98c051abceb2e98aec72173e0a634725b020c4bb993463437001a`.
- Rama de integración pública: `integration/canonical-v70-340`.

El repositorio público no incorpora el historial ni la lógica privada del proyecto fuente. Conserva trazabilidad contra el tag exacto y recibe únicamente el shell visual, estilos y assets públicos autorizados de V70.

## Assets oficiales

- `public/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg`
- `public/brand/radar-electoral-isotipo.svg`
- `public/brand/radar-isotipo.svg`
- `public/brand/radar-brand-tokens.json`
- `public/brand/radar-theme.css`
- `src/styles/v70/globals.css`
- `src/styles/v70/portal.css`
- `src/styles/v70/radar-brand-v3.css`

No se permite sustituir el logo, reinterpretar la paleta, cambiar tipografía, spacing, componentes, navegación, tema, responsive ni interacciones aprobadas.

## Secciones autorizadas

1. Inicio
2. Inteligencia Municipal
3. Estrategia
4. Directorio
5. Agenda
6. Mapa Inteligente
7. Día D
8. Recursos
9. Pulso Electoral
10. IA RADAR
11. Configuración

## Regla obligatoria: no redesign

V70 es la única referencia visual, funcional y de UX autorizada. Las versiones anteriores, el “Expediente Municipal 360”, maquetas nacionales, prototipos y shells alternativos no pueden usarse como interfaz del cliente.

La única adaptación autorizada es la parametrización por:

`municipality_code + campaign_id + user_role + permissions`

La ruta canónica es `/municipio/{municipality_code}`. Debe existir un solo árbol de componentes reutilizable para los 340 municipios; no se permiten forks ni páginas municipales duplicadas.

## Proceso obligatorio para cambios futuros

1. Partir del tag `radar-dashboard-canonical-v70` y registrar el commit fuente.
2. Crear una rama específica; nunca modificar ni mover el tag canónico.
3. Limitar el cambio a datos, contexto, permisos, loaders, contratos, routing, seguridad o correcciones verificables.
4. Mantener separados Data Vault y Campaign Vault. Ningún dato sensible puede quedar en el bundle público.
5. Ejecutar typecheck, build de producción, smoke 340/340 y pruebas de fallback SPA.
6. Comparar visualmente `/municipio/0509` y `/municipio/1901` contra V70, incluyendo claro/oscuro, responsive, sidebar y navegación.
7. No actualizar `main`, `deploy-hostinger` ni Hostinger hasta aprobar esas comparaciones.
8. Todo cambio visual futuro exige autorización expresa y una nueva referencia canónica documentada.
