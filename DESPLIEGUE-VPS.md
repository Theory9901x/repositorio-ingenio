# Despliegue en VPS de Hostinger — desde cero

Guía para dejar el Repositorio Documental corriendo en tu VPS con HTTPS, en
`repositorio.grupoingenio.cloud`. Los archivos se guardan en disco del VPS.

**Stack:** Ubuntu 24.04 · Node.js 20 · MySQL · Nginx (proxy) · PM2 · SSL (Let's Encrypt).

> Sustituye en todo el documento:
> - `TU_IP` → la IP pública de tu VPS
> - `repositorio.grupoingenio.cloud` → tu subdominio si usas otro
> - `CLAVE_DB`, `CLAVE_ADMIN`, `SECRETO_LARGO` → valores tuyos

---

## FASE 1 · Instalar el sistema operativo (pantalla actual)

1. En "Elige qué instalar" deja la pestaña **Sistema operativo simple** y elige
   **Ubuntu** (versión 24.04 LTS).
2. Continúa: define una **contraseña de root** fuerte (anótala) o añade tu clave SSH.
3. Elige la ubicación del servidor (la más cercana) y finaliza la instalación.
4. Cuando termine, en el panel del VPS copia la **dirección IP** pública (`TU_IP`).

---

## FASE 2 · Apuntar el subdominio al VPS (DNS)

1. hPanel → dominio **grupoingenio.cloud** → **DNS / Zona DNS**.
2. Crea un registro **A**:
   - Tipo: `A`
   - Nombre: `repositorio`
   - Apunta a / Valor: `TU_IP`
   - TTL: por defecto
3. Guarda. La propagación tarda de minutos a un par de horas.

---

## FASE 3 · Conectarte al VPS por SSH

Desde la terminal de VS Code (o PowerShell):

```bash
ssh root@TU_IP
```

Acepta la huella (`yes`) y escribe la contraseña de root.

---

## FASE 4 · Preparar el servidor (como root)

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Utilidades base
apt install -y git curl ufw

# Firewall: permitir SSH y web
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Nginx, MySQL y certbot
apt install -y nginx mysql-server certbot python3-certbot-nginx

# PM2 (gestor del proceso Node)
npm install -g pm2

# Usuario para correr la app (sin usar root)
adduser --disabled-password --gecos "" ingenio
usermod -aG sudo ingenio

# Carpeta de archivos subidos (persistente, fuera del repo)
mkdir -p /var/lib/repositorio/uploads
chown -R ingenio:ingenio /var/lib/repositorio
```

---

## FASE 5 · Base de datos MySQL (como root)

```bash
# Asistente de seguridad (responde):
#  - VALIDATE PASSWORD: n
#  - Set root password: y (pon una y anótala) o n si prefieres dejar socket
#  - Remove anonymous users: y
#  - Disallow root remoto: y
#  - Remove test database: y
#  - Reload privileges: y
mysql_secure_installation
```

Crear la base y el usuario de la app:

```bash
mysql
```
Dentro de MySQL, pega (cambia `CLAVE_DB`):

```sql
CREATE DATABASE repositorio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ingenio'@'%' IDENTIFIED WITH mysql_native_password BY 'CLAVE_DB';
GRANT ALL PRIVILEGES ON repositorio.* TO 'ingenio'@'%';
FLUSH PRIVILEGES;
EXIT;
```

---

## FASE 6 · Traer la app y configurarla (como ingenio)

```bash
su - ingenio

# Clonar tu repositorio de GitHub (el que subiste antes)
git clone https://github.com/TU-USUARIO/repositorio-ingenio.git
cd repositorio-ingenio

# Importar el esquema en la base de datos
mysql -u ingenio -p repositorio < schema.sql      # te pedirá CLAVE_DB

# Crear el archivo de variables de entorno
nano .env
```

Pega esto en `.env` (con tus valores) y guarda (Ctrl+O, Enter, Ctrl+X):

```env
DATABASE_URL="mysql://ingenio:CLAVE_DB@127.0.0.1:3306/repositorio"
ADMIN_PASSWORD="CLAVE_ADMIN"
AUTH_SECRET="SECRETO_LARGO"
UPLOAD_DIR="/var/lib/repositorio/uploads"
NODE_ENV="production"
```

Instalar dependencias y compilar:

```bash
npm install
npm run build
```

Arrancar con PM2:

```bash
pm2 start npm --name repositorio -- start
pm2 save
pm2 startup
# PM2 imprimirá un comando que empieza con "sudo env PATH=...".
# COPIA y EJECUTA ese comando tal cual para que arranque solo al reiniciar.
```

Comprueba que está vivo:

```bash
pm2 status
curl -I http://127.0.0.1:3000     # debe responder 200/307
exit                              # volver a root
```

---

## FASE 7 · Nginx como proxy (como root)

```bash
nano /etc/nginx/sites-available/repositorio
```

Pega:

```nginx
server {
    listen 80;
    server_name repositorio.grupoingenio.cloud;

    client_max_body_size 30M;   # permite subir archivos hasta 30 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar y recargar:

```bash
ln -s /etc/nginx/sites-available/repositorio /etc/nginx/sites-enabled/
nginx -t          # debe decir "syntax is ok"
systemctl reload nginx
```

---

## FASE 8 · HTTPS con certificado gratuito (como root)

> Asegúrate primero de que el DNS de la Fase 2 ya propagó
> (prueba: `ping repositorio.grupoingenio.cloud` debe responder con `TU_IP`).

```bash
certbot --nginx -d repositorio.grupoingenio.cloud
```

Sigue las preguntas (correo, aceptar términos, redirigir HTTP→HTTPS: opción 2).
Certbot configura el SSL y la renovación automática.

---

## FASE 9 · Probar

Abre `https://repositorio.grupoingenio.cloud`:

1. Verás el **mapa de procesos**.
2. Botón **Administración** → ingresa `CLAVE_ADMIN`.
3. Crea un documento, sube un PDF y verifica que se descarga.

¡Listo! Ya está en producción.

---

## Actualizar la app más adelante

Cada vez que cambies el código en VS Code y hagas `git push`:

```bash
ssh root@TU_IP
su - ingenio
cd repositorio-ingenio
git pull
npm install        # solo si cambiaron dependencias
npm run build
pm2 restart repositorio
```

Tus documentos NO se pierden: viven en MySQL y en `/var/lib/repositorio/uploads`.

---

## Respaldos (recomendado)

```bash
# Base de datos
mysqldump -u ingenio -p repositorio > ~/backup-bd-$(date +%F).sql
# Archivos
tar -czf ~/backup-archivos-$(date +%F).tar.gz /var/lib/repositorio/uploads
```

## Notas de seguridad

- Mantén el sistema actualizado: `apt update && apt upgrade -y`.
- Considera entrar por **clave SSH** y desactivar el login por contraseña.
- Opcional: instala `fail2ban` para frenar intentos de acceso por fuerza bruta.
- El puerto 3000 queda cerrado al exterior por `ufw`; solo Nginx (80/443) es público.
