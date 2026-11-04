#!/bin/sh
# Arranque del demo en Render: puerto, datos de prueba, moderadores y Apache.
set -e
PUERTO="${PORT:-10000}"
sed -ri "s/Listen 80$/Listen ${PUERTO}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:80>/<VirtualHost *:${PUERTO}>/" /etc/apache2/sites-available/000-default.conf
cd /var/www/html
php docker/semilla.php
chown -R www-data:www-data /var/www/datos
exec apache2-foreground
