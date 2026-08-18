# RADAR · Inteligencia Electoral

Base técnica de la plataforma nacional de inteligencia electoral para Guatemala.

## Alcance inicial

- portada nacional;
- navegación dinámica por departamento y municipio;
- buscador y selector territorial;
- comparación municipal;
- consola interna separada;
- estados de cobertura: completo, parcial y pendiente;
- arquitectura preparada para conectar datos validados del RADAR Data Vault;
- despliegue SPA compatible con Hostinger.

## Tecnología

- React 19
- TypeScript
- Vite
- React Router
- CSS con tokens oficiales de marca

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

## Validación y producción

```bash
npm run typecheck
npm run build
npm run preview
```

El resultado de producción se genera en `dist/`.

## Rutas base

| Ruta | Función |
| --- | --- |
| `/` | Centro nacional |
| `/departamento/:departmentCode` | Ficha departamental |
| `/municipio/:municipalityCode` | Expediente municipal |
| `/comparar` | Comparación municipal |
| `/admin` | Consola interna |

## Estructura

```text
src/
  app/          Enrutamiento y shell principal
  components/   Componentes reutilizables
  data/         Adaptadores y datos semilla
  features/     Módulos funcionales por dominio
  lib/          Utilidades compartidas
  styles/       Tokens y estilos globales
  types/        Contratos del dominio
```

## Principios de datos

- Una sola plantilla dinámica por `municipalityCode`.
- No duplicar fuentes RAW nacionales.
- Mantener trazabilidad y fecha de corte.
- No imputar faltantes.
- Separar Data Vault validado de Campaign Vault privado.
- Distinguir datos completos, parciales, pendientes y no publicados.

## Estado

Fase 0: estructura inicial y navegación funcional.
