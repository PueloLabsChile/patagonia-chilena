# Demo de Patagonia Chilena para Render (PHP 8.2 + Apache + SQLite).
# Los datos son de prueba y se regeneran en cada reinicio; no se envían correos.
FROM php:8.2-apache

RUN a2enmod rewrite headers expires deflate alias \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf

COPY . /var/www/html/
RUN cp /var/www/html/docker/config.demo.php /var/www/html/api/config.php \
 && mkdir -p /var/www/datos && chown -R www-data:www-data /var/www/datos \
 && chmod +x /var/www/html/docker/inicio.sh

CMD ["/var/www/html/docker/inicio.sh"]
