# Patagonia Chilena · patagoniadechile.cl

Sitio del movimiento ciudadano que busca formar una cooperativa para recuperar tierra patagónica.
**Etapa 1:** inscripción gratuita, sin monto. Se pide nombre, correo y comuna, y se confirma por correo.

## Demo
https://patagonia-chilena-demo.onrender.com (Render, plan gratuito). Usa datos de prueba que se regeneran en cada reinicio, no envía correos (muestra el enlace de confirmación en pantalla) y se duerme tras 15 minutos sin visitas: la primera carga puede tardar cerca de un minuto. Los enlaces de moderación del demo aparecen en los registros del servicio en Render.

## Estructura
| Ruta | Qué es |
|---|---|
| `index.html`, `assets/` | Sitio: relato con mapa 3D, historia de los límites, mapa de inscritos, anticipo de la Asamblea, inscripción y tarjeta para compartir |
| `asamblea.html` | Sala virtual: hemiciclo 3D (three.js), chat La Plaza y Sesión, palabra, votación consultiva, aplausos |
| `moderacion.html` | Panel de moderación (se entra con un enlace secreto `?m=`) |
| `privacidad.html` | Política de privacidad |
| `datos/` | Capas del visor, piezas históricas y cifras (las generan los scripts) |
| `api/*.php` | API para cPanel: PHP 8.1+ con pdo_sqlite y `mail()` |
| `dev/` | Servidor local, simulador y capturas de revisión (no se sube) |
| `scripts/` | Preparación de datos (Python: shapely y pyproj) |

## Correr en local (PHP real, el mismo código que va al hosting)
```
C:\Users\piali\tools\php81\php.exe -S 127.0.0.1:4410 -t . dev/router.php
```
- El `api/config.php` local tiene `'dev' => true`: no envía correos y muestra el enlace de confirmación en pantalla.
- `php dev/simular.php` simula 450 conectados y chat. `php dev/simular.php vivo` fuerza la sesión en vivo con votación y aplausos. `php dev/simular.php limpiar` lo deshace.
- Capturas de revisión: `node dev/capturas.mjs <dir>` (sitio) y `node dev/capturas-v3.mjs <dir>` (historia y Asamblea).

## Asamblea y moderación
- Primera Asamblea: **sábado 5 de diciembre de 2026, 19:00** (Chile continental). La fecha, la duración y el enlace de YouTube van en `config.php` → `asamblea`.
- Participación: `api/sala.php` (estado en vivo, sondeo cada 3 s, caché de 2 s) y `api/participar.php` (apodo, mensaje, palabra, votar, aplauso, denunciar, acreditar).
- Moderadores: se crean por consola en el servidor y cada uno recibe un enlace secreto a `moderacion.html`:
  `php api/herramientas/moderadores.php crear "Nombre" [correo]` · `listar` · `quitar "Nombre"`.
- Capacidad del sondeo en hosting compartido: del orden de 1.000 a 2.000 personas conectadas a la vez. Si se supera, conviene pasar el tiempo real a un servicio externo (Supabase o Ably).

## Regenerar datos
```
python scripts/preparar_limites.py     # INE Censo 2024 (gpkg en Desktop\propiedades\data)
python scripts/preparar_capas_osm.py   # áreas protegidas y glaciares (Overpass, con caché)
python scripts/recortar_capas.py       # recorta a Chile y escribe datos/cifras.json
python scripts/poblacion.py            # población del Censo 2024 por comuna
python scripts/preparar_historia.py    # piezas históricas (CShapes 2.0 en scripts/cache/cshapes)
```
CShapes 2.0 (ETH Zürich y PRIO) tiene licencia CC BY-NC-SA 4.0: uso no comercial, citando la fuente.

## Publicar en cPanel
1. Subir todo **menos** `dev/`, `scripts/`, `.git`, `LEEME.md` y el `api/config.php` local.
2. En `api/`, copiar `config.ejemplo.php` como `config.php` y completar la sal, los correos y el enlace del video.
3. Crear la casilla `no-responder@patagoniadechile.cl`. La base queda en `~/patagonia_datos/` (fuera de `public_html`) y se crea sola.
4. Crear los moderadores por consola y enviarle a cada uno su enlace.
5. Probar una inscripción real y revisar que el correo no caiga en spam (configurar SPF y DKIM en cPanel → Email Deliverability).
