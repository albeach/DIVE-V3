# DIVE V3 - Spain SAML IdP
# Official SimpleSAMLphp v2.4.3 from GitHub
# https://github.com/simplesamlphp/simplesamlphp/releases/tag/v2.4.3

FROM php:8.2-apache

# Install required PHP extensions
RUN apt-get update && apt-get install -y \
    libxml2-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    git \
    unzip \
    && docker-php-ext-install xml curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Download and install official SimpleSAMLphp v2.4.3
WORKDIR /var/www
RUN curl -L https://github.com/simplesamlphp/simplesamlphp/releases/download/v2.4.3/simplesamlphp-2.4.3-full.tar.gz -o simplesamlphp.tar.gz \
    && tar -xzf simplesamlphp.tar.gz \
    && mv simplesamlphp-2.4.3 simplesamlphp \
    && rm simplesamlphp.tar.gz

# Set up Apache configuration
RUN echo "Alias /simplesaml /var/www/simplesamlphp/public" > /etc/apache2/conf-available/simplesamlphp.conf \
    && echo "<Directory /var/www/simplesamlphp/public>" >> /etc/apache2/conf-available/simplesamlphp.conf \
    && echo "    Require all granted" >> /etc/apache2/conf-available/simplesamlphp.conf \
    && echo "</Directory>" >> /etc/apache2/conf-available/simplesamlphp.conf \
    && a2enconf simplesamlphp \
    && a2enmod rewrite

# Set permissions
RUN chown -R www-data:www-data /var/www/simplesamlphp

# Configure Apache to listen on port 8080
RUN sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:8080>/' /etc/apache2/sites-available/000-default.conf

# Default working directory
WORKDIR /var/www/simplesamlphp

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:8080/simplesaml/ || exit 1

# Start Apache
CMD ["apache2-foreground"]

