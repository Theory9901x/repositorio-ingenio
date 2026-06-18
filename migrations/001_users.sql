-- =====================================================================
--  REPOSITORIO DOCUMENTAL · GRUPO INGENIO
--  Migración 001 – Tabla de usuarios
--  Aplicar en MySQL: mysql -u user -p db < migrations/001_users.sql
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(160) NOT NULL,
  cedula        VARCHAR(20)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  cargo         VARCHAR(100) NOT NULL DEFAULT '',
  role          ENUM('admin','usuario') NOT NULL DEFAULT 'usuario',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
