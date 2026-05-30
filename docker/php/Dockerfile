FROM php:8.1-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip libzip-dev libcurl4-openssl-dev \
    && docker-php-ext-install pdo_mysql curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY . /var/www/html
EXPOSE 8001

CMD ["php", "-S", "0.0.0.0:8001", "-t", ".", "api/router.php"]