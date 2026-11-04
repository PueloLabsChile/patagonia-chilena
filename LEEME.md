# Patagonia Chilena · patagoniachilena.cl

Sitio del movimiento ciudadano que busca formar una cooperativa para recuperar tierra patagónica.
**Etapa 1:** inscripción gratuita, sin monto. Se pide nombre, correo y comuna, y se confirma por correo.

## Estructura
| Ruta | Qué es |
|---|---|
| `index.html`, `assets/` | Sitio estático: relato con mapa 3D (MapLibre 5.6 + relieve), contador, mapa de inscritos, inscripción y tarjeta para compartir |
| `privacidad.html` | Política de privacidad |
| `datos/` | Capas del visor y cifras (las generan los scripts) |
| `api/*.php` | API para cPanel: PHP 7.4+ con pdo_sqlite y `mail()` |
| `dev/servidor.mjs` | Servidor local que imita la API (Node 22+, `node:sqlite`). No envía correos |
| `scripts/` | Preparación de datos (Python: shapely y pyproj) |

## Correr en local
```
node dev/servidor.mjs            # http://127.0.0.1:4410
node dev/servidor.mjs --semilla  # además crea 1.800 inscritos de prueba
```
En local, el enlace de confirmación aparece en pantalla y en la consola.

## Regenerar datos
```
python scripts/preparar_limites.py     # INE Censo 2024 (gpkg en Desktop\propiedades\data)
python scripts/preparar_capas_osm.py   # áreas protegidas y glaciares (Overpass, con caché)
python scripts/recortar_capas.py       # recorta a Chile y escribe datos/cifras.json
```

## Publicar en cPanel
1. Subir todo **menos** `dev/`, `scripts/`, `.git`, `LEEME.md`.
2. En `api/`, copiar `config.ejemplo.php` como `config.php` y completar la sal y los correos.
3. Crear la casilla `no-responder@patagoniachilena.cl`. La base queda en `~/patagonia_datos/` (fuera de `public_html`) y se crea sola.
4. Probar una inscripción real y revisar que el correo no caiga en spam (configurar SPF y DKIM en cPanel → Email Deliverability).
