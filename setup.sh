#!/bin/bash

# =============================================================================
# ALSMail Installer Script
# Ubuntu 22.04+
# Installs: PHP 8.4, Nginx, MySQL, Postfix, Dovecot, Laravel ALSMail
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[ALSMail]${NC} $1"; }
warn()   { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
section(){ echo -e "\n${BLUE}========================================${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}========================================${NC}\n"; }

# =============================================================================
# ROOT CHECK
# =============================================================================
if [[ $EUID -ne 0 ]]; then
  error "Script ini harus dijalankan sebagai root. Gunakan: sudo bash alsmail-installer.sh"
fi

# =============================================================================
# HARDCODED DATABASE CONFIG
# =============================================================================
DB_NAME="maildb"
DB_USER="mailuser"
DB_PASS="MailPass123!"
DB_ROOT_PASS="RootMail123!"

# Mail storage
VMAIL_USER="vmail"
VMAIL_UID=5000
VMAIL_GID=5000
MAIL_BASE="/var/mail/vhosts"

# Laravel repo
REPO_URL="https://github.com/anandhi25/mail-app-core.git"
APP_DIR="/var/www/mailapp"

# =============================================================================
# PROMPTED CONFIG
# =============================================================================
section "Konfigurasi ALSMail"

read -p "Domain webmail (contoh: mail.als.co.id): " WEBMAIL_DOMAIN
[[ -z "$WEBMAIL_DOMAIN" ]] && error "Domain tidak boleh kosong"

read -p "Domain email (contoh: als.co.id): " MAIL_DOMAIN
[[ -z "$MAIL_DOMAIN" ]] && error "Domain email tidak boleh kosong"

read -p "Email admin (contoh: admin@als.co.id): " ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && error "Email admin tidak boleh kosong"

read -p "Username system untuk menjalankan app (contoh: alsmail): " SYS_USER
[[ -z "$SYS_USER" ]] && error "Username tidak boleh kosong"

read -s -p "Password default admin panel: " ADMIN_PASS
echo ""
[[ -z "$ADMIN_PASS" ]] && error "Password tidak boleh kosong"

echo ""
log "Domain webmail : $WEBMAIL_DOMAIN"
log "Domain email   : $MAIL_DOMAIN"
log "Admin email    : $ADMIN_EMAIL"
log "System user    : $SYS_USER"
echo ""
read -p "Konfirmasi konfigurasi di atas? (y/n): " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && error "Instalasi dibatalkan"

# =============================================================================
# SYSTEM UPDATE
# =============================================================================
section "Update System"
apt update -y && apt upgrade -y
apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg2

# =============================================================================
# CREATE SYSTEM USER
# =============================================================================
section "Setup System User"
if ! id "$SYS_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$SYS_USER"
  log "User $SYS_USER dibuat"
else
  log "User $SYS_USER sudah ada, skip"
fi

# =============================================================================
# PHP 8.4
# =============================================================================
section "Install PHP 8.4"
add-apt-repository ppa:ondrej/php -y
apt update -y
apt install -y \
  php8.4 php8.4-fpm php8.4-mysql php8.4-mbstring php8.4-xml \
  php8.4-curl php8.4-zip php8.4-imap php8.4-bcmath php8.4-intl \
  php8.4-dom php8.4-gd php8.4-redis

php -v
log "PHP 8.4 terinstall"

# =============================================================================
# NGINX
# =============================================================================
section "Install Nginx"
apt install -y nginx
systemctl enable nginx
systemctl start nginx
log "Nginx terinstall"

# =============================================================================
# MYSQL
# =============================================================================
section "Install MySQL"
apt install -y mysql-server

# Secure MySQL
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASS}';" 2>/dev/null || true
mysql -u root -p"${DB_ROOT_PASS}" -e "DELETE FROM mysql.user WHERE User='';" 2>/dev/null || true
mysql -u root -p"${DB_ROOT_PASS}" -e "DROP DATABASE IF EXISTS test;" 2>/dev/null || true
mysql -u root -p"${DB_ROOT_PASS}" -e "FLUSH PRIVILEGES;" 2>/dev/null || true

# Create database and user
mysql -u root -p"${DB_ROOT_PASS}" <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

log "MySQL dan database $DB_NAME siap"

# =============================================================================
# POSTFIX
# =============================================================================
section "Install Postfix"
DEBIAN_FRONTEND=noninteractive apt install -y postfix postfix-mysql

# Buat lookup files
cat > /etc/postfix/mysql-virtual-domains.cf <<EOF
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT name FROM domains WHERE name='%s' AND active=1
EOF

cat > /etc/postfix/mysql-virtual-mailboxes.cf <<EOF
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT CONCAT(SUBSTRING_INDEX(email,'@',-1),'/',SUBSTRING_INDEX(email,'@',1),'/') FROM mail_users WHERE email='%s' AND active=1
EOF

cat > /etc/postfix/mysql-virtual-aliases.cf <<EOF
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT destination FROM aliases WHERE source='%s' AND active=1
EOF

# Konfigurasi main.cf
cat > /etc/postfix/main.cf <<EOF
# Basic
myhostname = ${WEBMAIL_DOMAIN}
mydomain = ${MAIL_DOMAIN}
myorigin = \$mydomain
inet_interfaces = all
inet_protocols = ipv4
mydestination = localhost

# Virtual mailbox
virtual_mailbox_domains = mysql:/etc/postfix/mysql-virtual-domains.cf
virtual_mailbox_maps = mysql:/etc/postfix/mysql-virtual-mailboxes.cf
virtual_alias_maps = mysql:/etc/postfix/mysql-virtual-aliases.cf
virtual_mailbox_base = ${MAIL_BASE}
virtual_minimum_uid = 100
virtual_uid_maps = static:${VMAIL_UID}
virtual_gid_maps = static:${VMAIL_GID}

# SMTP Auth
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_recipient_restrictions =
    permit_sasl_authenticated,
    permit_mynetworks,
    reject_unauth_destination

# TLS
smtpd_tls_cert_file = /etc/letsencrypt/live/${WEBMAIL_DOMAIN}/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/${WEBMAIL_DOMAIN}/privkey.pem
smtpd_tls_security_level = may
smtp_tls_security_level = may
smtpd_tls_auth_only = yes

# Mailbox
home_mailbox = Maildir/
mailbox_command =
EOF

systemctl enable postfix
systemctl restart postfix
log "Postfix terkonfigurasi"

# =============================================================================
# DOVECOT
# =============================================================================
section "Install Dovecot"
apt install -y dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-mysql

# vmail user
groupadd -g ${VMAIL_GID} ${VMAIL_USER} 2>/dev/null || true
useradd -g ${VMAIL_USER} -u ${VMAIL_UID} ${VMAIL_USER} -d ${MAIL_BASE} -s /sbin/nologin 2>/dev/null || true
mkdir -p ${MAIL_BASE}/${MAIL_DOMAIN}
chown -R ${VMAIL_USER}:${VMAIL_USER} ${MAIL_BASE}

# 10-auth.conf
cat > /etc/dovecot/conf.d/10-auth.conf <<EOF
disable_plaintext_auth = no
auth_mechanisms = plain login
!include auth-sql.conf.ext
EOF

# auth-sql.conf.ext
cat > /etc/dovecot/conf.d/auth-sql.conf.ext <<EOF
passdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}
userdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}
EOF

# dovecot-sql.conf.ext
cat > /etc/dovecot/dovecot-sql.conf.ext <<EOF
driver = mysql
connect = host=127.0.0.1 dbname=${DB_NAME} user=${DB_USER} password=${DB_PASS}
default_pass_scheme = SHA512-CRYPT
password_query = SELECT password FROM mail_users WHERE email='%u' AND active=1
user_query = SELECT \\
    '${MAIL_BASE}/%d/%n' AS home, \\
    'maildir:${MAIL_BASE}/%d/%n' AS mail, \\
    ${VMAIL_UID} AS uid, ${VMAIL_GID} AS gid, \\
    CONCAT('*:bytes=', COALESCE(quota_bytes, 10737418240)) AS quota_rule \\
    FROM mail_users WHERE email='%u' AND active=1
EOF

# 10-mail.conf
sed -i "s|^mail_location.*|mail_location = maildir:${MAIL_BASE}/%d/%n|" /etc/dovecot/conf.d/10-mail.conf

# SSL config
cat > /etc/dovecot/conf.d/10-ssl.conf <<EOF
ssl = yes
ssl_cert = </etc/letsencrypt/live/${WEBMAIL_DOMAIN}/fullchain.pem
ssl_key = </etc/letsencrypt/live/${WEBMAIL_DOMAIN}/privkey.pem
ssl_client_ca_dir = /etc/ssl/certs
ssl_dh = </usr/share/dovecot/dh.pem
EOF

systemctl enable dovecot
systemctl restart dovecot
log "Dovecot terkonfigurasi"

# =============================================================================
# NODE.JS
# =============================================================================
section "Install Node.js"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v
log "Node.js terinstall"

# =============================================================================
# COMPOSER
# =============================================================================
section "Install Composer"
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
composer --version
log "Composer terinstall"

# =============================================================================
# LARAVEL APP
# =============================================================================
section "Deploy Laravel ALSMail"

# Clone repo
if [ -d "$APP_DIR" ]; then
  warn "Direktori $APP_DIR sudah ada, pulling latest..."
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# Install dependencies
composer install --no-dev --optimize-autoloader
npm install
npm run build

# Setup .env
cp .env.example .env 2>/dev/null || touch .env

cat > "$APP_DIR/.env" <<EOF
APP_NAME="ALSMail"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://${WEBMAIL_DOMAIN}

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${DB_NAME}
DB_USERNAME=${DB_USER}
DB_PASSWORD=${DB_PASS}

IMAP_HOST=127.0.0.1
IMAP_PORT=143
IMAP_ENCRYPTION=starttls
IMAP_VALIDATE_CERT=false
IMAP_DEFAULT_ACCOUNT=default

MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=587
MAIL_FROM_ADDRESS="noreply@${MAIL_DOMAIN}"
MAIL_FROM_NAME="ALSMail"

QUEUE_CONNECTION=database
SESSION_DRIVER=database
CACHE_DRIVER=database
EOF

# Generate key
php artisan key:generate --force

# Run migrations
php artisan migrate --force

# Seed database
php artisan db:seed --force 2>/dev/null || true

# Set permissions
chown -R www-data:www-data "$APP_DIR"
chmod -R 775 "$APP_DIR/storage"
chmod -R 775 "$APP_DIR/bootstrap/cache"

# Add SYS_USER to www-data group
usermod -aG www-data "$SYS_USER"

log "Laravel ALSMail di-deploy"

# =============================================================================
# NGINX CONFIG
# =============================================================================
section "Konfigurasi Nginx"

cat > /etc/nginx/sites-available/alsmail <<EOF
server {
    listen 80;
    server_name ${WEBMAIL_DOMAIN};
    root ${APP_DIR}/public;
    index index.php;

    client_max_body_size 100M;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.ht {
        deny all;
    }
}
EOF

ln -sf /etc/nginx/sites-available/alsmail /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx terkonfigurasi"

# =============================================================================
# SSL - CERTBOT
# =============================================================================
section "Setup SSL (Let's Encrypt)"
apt install -y certbot python3-certbot-nginx

warn "SSL akan di-request via DNS challenge"
warn "Siapkan akses ke DNS provider untuk tambah TXT record"
echo ""
certbot certonly --manual --preferred-challenges dns -d "$WEBMAIL_DOMAIN" \
  --agree-tos --email "$ADMIN_EMAIL" --no-eff-email

# Update nginx untuk SSL
cat > /etc/nginx/sites-available/alsmail <<EOF
server {
    listen 80;
    server_name ${WEBMAIL_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${WEBMAIL_DOMAIN};
    root ${APP_DIR}/public;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/${WEBMAIL_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${WEBMAIL_DOMAIN}/privkey.pem;

    client_max_body_size 100M;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.ht {
        deny all;
    }
}
EOF

nginx -t && systemctl reload nginx
log "SSL terkonfigurasi"

# =============================================================================
# QUEUE WORKER (systemd service)
# =============================================================================
section "Setup Queue Worker"

cat > /etc/systemd/system/alsmail-queue.service <<EOF
[Unit]
Description=ALSMail Queue Worker
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/php ${APP_DIR}/artisan queue:work --sleep=3 --tries=3 --timeout=90
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable alsmail-queue
systemctl start alsmail-queue
log "Queue worker aktif"

# =============================================================================
# SUDO PERMISSION UNTUK MAILDIR
# =============================================================================
section "Setup Permissions"

cat > /etc/sudoers.d/alsmail <<EOF
www-data ALL=(ALL) NOPASSWD: /bin/mkdir
www-data ALL=(ALL) NOPASSWD: /bin/chown
EOF
chmod 440 /etc/sudoers.d/alsmail

# =============================================================================
# IMAPSYNC
# =============================================================================
section "Install imapsync"

apt install -y libauthen-ntlm-perl libcgi-pm-perl libcrypt-openssl-rsa-perl \
  libdata-uniqid-perl libencode-imaputf7-perl libfile-copy-recursive-perl \
  libfile-tail-perl libio-socket-inet6-perl libio-socket-ssl-perl \
  libio-tee-perl libhtml-parser-perl libmail-imapclient-perl \
  libmodule-scandeps-perl libreadonly-perl libregexp-common-perl \
  libsys-meminfo-perl libterm-readkey-perl libtest-mockobject-perl \
  libtest-pod-perl libunicode-string-perl liburi-perl libwww-perl 2>/dev/null || true

wget -q https://raw.githubusercontent.com/imapsync/imapsync/master/imapsync -O /usr/local/bin/imapsync
chmod +x /usr/local/bin/imapsync
log "imapsync terinstall"

# =============================================================================
# ARTISAN COMMAND UNTUK MAILDIR
# =============================================================================
section "Setup Artisan Commands"

php artisan optimize
log "Laravel optimized"

# =============================================================================
# FIREWALL
# =============================================================================
section "Setup Firewall"

if command -v ufw &>/dev/null; then
  ufw allow 22/tcp
  ufw allow 25/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 143/tcp
  ufw allow 587/tcp
  ufw allow 465/tcp
  ufw allow 993/tcp
  ufw allow 995/tcp
  ufw --force enable
  log "UFW firewall dikonfigurasi"
fi

# =============================================================================
# SUMMARY
# =============================================================================
section "Instalasi Selesai!"

echo -e "${GREEN}"
echo "================================================="
echo " ALSMail berhasil diinstall!"
echo "================================================="
echo ""
echo " URL Webmail    : https://${WEBMAIL_DOMAIN}"
echo " Domain Email   : ${MAIL_DOMAIN}"
echo " Admin Email    : ${ADMIN_EMAIL}"
echo " App Directory  : ${APP_DIR}"
echo " Mail Storage   : ${MAIL_BASE}"
echo ""
echo " Database       : ${DB_NAME}"
echo " DB User        : ${DB_USER}"
echo " DB Password    : ${DB_PASS}"
echo ""
echo " Postfix        : $(systemctl is-active postfix)"
echo " Dovecot        : $(systemctl is-active dovecot)"
echo " Nginx          : $(systemctl is-active nginx)"
echo " MySQL          : $(systemctl is-active mysql)"
echo " Queue Worker   : $(systemctl is-active alsmail-queue)"
echo ""
echo " Next steps:"
echo " 1. Tambah domain di panel: https://${WEBMAIL_DOMAIN}"
echo " 2. Buat user email pertama"
echo " 3. Setup MX record: ${WEBMAIL_DOMAIN}"
echo " 4. Setup SPF, DKIM, DMARC"
echo "================================================="
echo -e "${NC}"
