# Repositorio Documental · Grupo Ingenio

> **¿Vas a desplegar en un VPS?** Sigue **`DESPLIEGUE-VPS.md`** (es la ruta elegida).
> En esa modalidad los archivos se guardan **en disco** (carpeta `UPLOAD_DIR`).
> Esta guía de abajo es la alternativa para el hosting *gestionado* de Hostinger.

Aplicación de gestión documental por procesos: mapa de procesos → repositorio por
tipo de documento → panel de administración (crear / editar / eliminar, control de
versiones y estados). Construida con **Next.js + MySQL**, pensada para correr en el
**hosting Business de Hostinger** (apps Node.js) con la base de datos MySQL del mismo plan.

- Los **metadatos** (procesos, tipos, códigos, versiones, estados) y los **archivos**
  (PDF/Word, como BLOB) viven en MySQL.
- El panel admin queda detrás de una contraseña.
- El código de cada documento se genera solo: `GI-[sigla proceso]-[sigla tipo]-[consecutivo]`.

---

## 0) Lo que necesitas tener

- Tu plan **Business** de Hostinger (ya lo tienes; soporta apps Node.js).
- Una cuenta de **GitHub** (gratis).
- **VS Code** con Git instalado.
- 30–40 minutos.

---

## 1) Subir el proyecto a GitHub (desde VS Code)

1. Abre esta carpeta `repositorio-ingenio` en VS Code.
2. Terminal (`Ctrl+ñ`) y ejecuta:
   ```bash
   git init
   git add .
   git commit -m "Repositorio documental Grupo Ingenio - versión inicial"
   ```
3. En GitHub crea un repositorio **privado** vacío llamado `repositorio-ingenio`
   (sin README, sin .gitignore).
4. Conéctalo y súbelo (cambia TU-USUARIO):
   ```bash
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/repositorio-ingenio.git
   git push -u origin main
   ```

> El archivo `.gitignore` ya evita subir `node_modules` y el `.env` con tus claves.

---

## 2) Crear la base de datos MySQL en Hostinger

1. Entra a **hPanel** → tu hosting → **Bases de datos → MySQL**.
2. En "Crear nueva base de datos MySQL" pon:
   - Nombre de BD: `repositorio` (quedará como `u123456_repositorio`)
   - Usuario: `ingenio` (quedará como `u123456_ingenio`)
   - Contraseña: genera una fuerte y **guárdala**.
3. Crea la base. Anota estos cuatro datos: **host** (en Hostinger casi siempre
   `localhost`), **nombre completo de la BD**, **usuario completo** y **contraseña**.
   Con ellos armarás la cadena de conexión del paso 5.

---

## 3) Importar las tablas (esquema)

1. En la misma pantalla de Bases de datos, abre **phpMyAdmin** sobre tu nueva BD.
2. Pestaña **Importar** → selecciona el archivo `schema.sql` de este proyecto → **Continuar**.
3. Deberías ver creadas las tablas `processes`, `doc_types` y `documents`, ya con tu
   mapa de procesos y los tipos de documento cargados.

---

## 4) Crear el subdominio en grupoingenio.cloud

1. hPanel → **Dominios → Subdominios**.
2. Crea el subdominio, por ejemplo: `repositorio` sobre `grupoingenio.cloud`
   → quedará `repositorio.grupoingenio.cloud`.
3. Déjalo creado; en el paso siguiente lo asignarás a la app.

---

## 5) Crear la app Node.js e importarla desde GitHub

1. hPanel → **Sitios web → Añadir sitio web → Aplicaciones Node.js**.
2. Elige **Importar repositorio de Git**, autoriza GitHub y selecciona
   `repositorio-ingenio`.
3. En la configuración de compilación:
   - **Framework**: Next.js (se autodetecta).
   - **Versión de Node**: 20 (o la LTS más reciente que ofrezca).
   - Comandos: build `npm run build`, start `npm run start` (suelen autodetectarse).
4. **Dominio de la app**: elige el subdominio del paso 4 (`repositorio.grupoingenio.cloud`).
5. Antes de desplegar, añade las **variables de entorno** (sección "Environment variables"):

   | Variable        | Valor                                                                 |
   |-----------------|-----------------------------------------------------------------------|
   | `DATABASE_URL`  | `mysql://USUARIO:CONTRASENA@localhost:3306/NOMBRE_BD`                  |
   | `ADMIN_PASSWORD`| la contraseña con la que entrarás al panel admin                      |
   | `AUTH_SECRET`   | una cadena larga aleatoria (mínimo 32 caracteres)                     |

   Usa los datos reales del paso 2. Ejemplo de `DATABASE_URL`:
   `mysql://u123456_ingenio:MiClave123@localhost:3306/u123456_repositorio`

6. **Desplegar**. Hostinger instala dependencias, compila y deja la app corriendo.

> Si la contraseña de la BD tiene símbolos raros (`@`, `:`, `/`), reemplázalos por su
> versión codificada en la URL (`@`→`%40`, etc.) o cámbiala por una sin esos símbolos.

---

## 6) SSL y prueba

1. hPanel → **Seguridad → SSL** sobre el subdominio → activa el certificado (suele ser
   automático y gratis).
2. Abre `https://repositorio.grupoingenio.cloud`. Deberías ver el **mapa de procesos**.
3. Botón **Administración** (arriba a la derecha) → ingresa tu `ADMIN_PASSWORD` →
   crea, edita o elimina documentos. Sube un PDF de prueba y verifica que se descarga.

---

## 7) Enlazarlo desde tu web

En tu landing (Horizons) y/o en el campus, agrega un botón/enlace a
`https://repositorio.grupoingenio.cloud`. No interfiere con nada de lo que ya tienes.

---

## 8) Cómo actualizar el sistema más adelante

Cada vez que cambies algo en VS Code:
```bash
git add .
git commit -m "describe el cambio"
git push
```
Luego en hPanel → tu app Node.js → **Volver a desplegar** (o queda automático si activas
el redeploy por push). Tus documentos NO se pierden: viven en la base de datos.

---

## Notas importantes

- **Tamaño de archivos**: los documentos se guardan en MySQL. Mantén cada archivo en un
  tamaño razonable (recomendado ≤ 25 MB). Para documentos muy pesados o un volumen muy
  grande a futuro, el siguiente paso natural sería un VPS de Hostinger guardando los
  archivos en disco; la migración es directa porque la metadata ya está estructurada.
- **Personalizar procesos y tipos**: si cambian, edita las tablas `processes` /
  `doc_types` en phpMyAdmin (o pídeme que te agregue una sección para gestionarlos
  desde el panel).
- **Seguridad**: nunca subas el archivo `.env` a GitHub (ya está en `.gitignore`).
  Cambia `ADMIN_PASSWORD` y `AUTH_SECRET` por valores propios y fuertes.

## Probar en tu computador (opcional)

```bash
npm install
cp .env.example .env        # edita .env con tus datos (puedes usar una BD MySQL local)
npm run dev                 # abre http://localhost:3000
```
