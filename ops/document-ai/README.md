# Google Document AI — piloto RADAR

Estado: integración preparada; requiere configuración de Google Cloud y activación explícita. No se han enviado actas a Google ni consumido páginas de pago.

## Activación

1. Crear/seleccionar un proyecto de Google Cloud; revisar elegibilidad de prueba y activar facturación de forma consciente.
2. Activar Document AI API. Crear **Enterprise Document OCR**, región `us` (o `eu`, mantener la misma en el endpoint). Anotar ID del proyecto, ID del procesador y una versión estable disponible. No crear un Custom Extractor para esta primera prueba.
3. Crear cuenta de servicio dedicada con rol **Document AI API User** (`roles/documentai.apiUser`) restringido al procesador/proyecto. Guardar su JSON **directamente en Secrets de Supabase**, nunca en chat, frontend ni GitHub fuente.
4. Secrets del proyecto Supabase:
   - `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT`: JSON de la cuenta de servicio.
   - `GOOGLE_DOCUMENT_AI_PROJECT_ID`
   - `GOOGLE_DOCUMENT_AI_LOCATION`: `us` o `eu`.
   - `GOOGLE_DOCUMENT_AI_PROCESSOR_ID`
   - `GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION`: ID explícito de la versión.
5. Aplicar la migración `document_ai_ocr_pilot` y desplegar `fiscal-document-ocr` con `verify_jwt=false`: esta función valida la sesión fiscal propia, revocación, dispositivo, campaña y asignación; no acepta anónimos.
6. Comprobar credenciales sin publicar resultados. Activar `radar_ocr_budget.enabled=true` manteniendo `demo_only=true`, `page_limit=100`. Reservas se cuentan para todo el piloto, sin reinicio automático; el saldo NO es un saldo de Google.
7. Conectar el cliente con el adaptador `fiscal-document-ai-client.ts` usando el token fiscal vigente del puente Hostinger. Esta conexión de interfaz se publica después de configurar y validar Google. El proveedor local continúa disponible.
8. Ensayar con 30–50 actas autorizadas de diferentes calidades y elecciones, transcritas por dos personas. Medir cifras exactas, filas mal asignadas, ceros/blancos, tiempo y tasa de captura manual. No declarar precisión sin este resultado.
9. Habilitar reales solo después de revisar métricas; mantener tope y revisar cuotas de concurrencia antes del Día D.

## Contrato API

POST `/functions/v1/fiscal-document-ocr`; headers `apikey` pública y `x-radar-session` secreto fiscal vigente; multipart `file` + `electionType`. El servidor deriva municipio/campaña/demo de la sesión, nunca del formulario. Una foto JPG/PNG/WEBP, hasta 12MB, una página. PDF multipágina queda fuera del piloto para evitar consumo no acotado.

Salida compatible con FiscalOcrResult: sugerencias preliminares, evidencia textual, confianza, calidad, advertencias y `requiresHumanReview=true`. Se proponen solo etiquetas exactas y únicas con una cifra en la misma línea; layouts/cifras ambiguos se dejan vacíos. No se infieren votos para cuadrar totales. Antes de una eventual extracción por casillas debemos validar la plantilla electoral vigente, nunca asumir el orden de 2023.

La foto original no se modifica aquí. La calidad OCR no equivale a nitidez aumentada ni a exactitud certificada. El RTD conserva su confirmación humana y validaciones existentes.

## Cupos e idempotencia

Reserva atómica en Postgres (fila de presupuesto bloqueada), máximo 100 llamadas de una página en el piloto, máximo 10 por asignación/24h. Caché por campaña+asignación+demo+prueba+elección+SHA de foto+procesador+versión+catálogo. Una lectura en curso/fallida no se reintenta automáticamente: un timeout pudo consumir una página. El modo manual sigue disponible.

Tablas nuevas con RLS y acceso exclusivo service_role. El resultado OCR privado se borra en cascada al borrar campaña/asignación; el contador global persiste para no recuperar artificialmente presupuesto eliminando demos. No se crean actas, votos ni totales RTD desde OCR. Errores del proveedor no se exponen con credenciales ni texto privado.

## Costos de referencia consultados 2026-10-08

https://cloud.google.com/products/document-ai/pricing
Enterprise OCR muestra primer tramo gratuito de 1,000 páginas y US$1.50/1,000 páginas en el tramo habitual posterior. Verificar condiciones y consumo del proyecto; no habilitar OCR add-ons ni Form Parser/Custom Extractor por defecto. Los créditos de bienvenida son sujetos a elegibilidad (Google anuncia US$300/90 días); no asumir que el beneficio existe en cualquier cuenta.
https://docs.cloud.google.com/free/docs/free-cloud-features
Ejemplo conservador sin deducir tramo gratuito: 24,427 JRV × 5 fotos × 1 página = 122,135 páginas ≈ US$183.20 solo OCR básico; no incluye repeticiones, almacenamiento, red ni otros servicios. Un aumento de nitidez no está incluido como restauración fotográfica.

## Pendiente antes de anunciar disponibilidad

- Proyecto, procesador y secretos Google configurados por el titular.
- Prueba real autenticada Google y comparación con cifras verificadas.
- Activación del botón/adaptador en el paquete fiscal vigente de Hostinger.
- Cierre/revocación durante una lectura y restauración de backup de metadatos verificados en QA.
