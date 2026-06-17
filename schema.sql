-- =====================================================================
--  REPOSITORIO DOCUMENTAL · GRUPO INGENIO
--  Esquema de base de datos (MySQL / MariaDB)
--  Importar en hPanel -> phpMyAdmin -> pestaña "Importar"
-- =====================================================================

SET NAMES utf8mb4;

-- ---------- Procesos (mapa de procesos) ----------
CREATE TABLE IF NOT EXISTS processes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sigla       VARCHAR(8)  NOT NULL,
  name        VARCHAR(160) NOT NULL,
  tier        ENUM('estrategico','misional','apoyo','evaluacion') NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tipos de documento ----------
CREATE TABLE IF NOT EXISTS doc_types (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sigla       VARCHAR(8)  NOT NULL,
  name        VARCHAR(80) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Documentos ----------
CREATE TABLE IF NOT EXISTS documents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  process_id  INT NOT NULL,
  type_id     INT NOT NULL,
  consecutive INT NOT NULL DEFAULT 1,
  version     VARCHAR(10) NOT NULL DEFAULT '1.0',
  state       ENUM('vigente','no_publicado','obsoleto','anulado') NOT NULL DEFAULT 'no_publicado',
  origin      ENUM('interno','externo') NOT NULL DEFAULT 'interno',
  is_public   TINYINT(1) NOT NULL DEFAULT 0,
  due_date    DATE NULL,
  file_name   VARCHAR(255) NULL,
  file_mime   VARCHAR(120) NULL,
  file_path   VARCHAR(255) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_process FOREIGN KEY (process_id) REFERENCES processes(id),
  CONSTRAINT fk_doc_type    FOREIGN KEY (type_id)    REFERENCES doc_types(id),
  INDEX idx_proc (process_id),
  INDEX idx_type (type_id),
  INDEX idx_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
--  DATOS INICIALES
-- =====================================================================

-- Mapa de procesos de Grupo Ingenio
INSERT INTO processes (id, sigla, name, tier, sort_order) VALUES
  (1,  'DE', 'Direccionamiento Estratégico',               'estrategico', 1),
  (2,  'GC', 'Gestión de la Calidad',                      'estrategico', 2),
  (3,  'GH', 'Gestión Humana',                             'estrategico', 3),
  (4,  'MK', 'Marketing y Comunicaciones',                 'estrategico', 4),
  (5,  'IT', 'Gestión de Innovación y Tecnología',         'estrategico', 5),
  (6,  'DF', 'Diseño y Desarrollo de Programas de Formación','misional',  1),
  (7,  'CO', 'Consultoría y Asesoría Empresarial',         'misional',    2),
  (8,  'AF', 'Gestión Administrativa y Financiera',        'apoyo',       1),
  (9,  'GJ', 'Gestión Jurídica',                           'apoyo',       2),
  (10, 'GD', 'Gestión Documental',                         'apoyo',       3),
  (11, 'MC', 'Mejoramiento Continuo',                      'evaluacion',  1);

-- Tipos de documento (según manual de elaboración)
INSERT INTO doc_types (id, sigla, name, sort_order) VALUES
  (1, 'MA', 'Manual',         1),
  (2, 'CA', 'Caracterización',2),
  (3, 'PR', 'Procedimiento',  3),
  (4, 'IN', 'Instructivo',    4),
  (5, 'FO', 'Formato',        5),
  (6, 'PL', 'Política',       6),
  (7, 'PG', 'Programa',       7),
  (8, 'AN', 'Anexo',          8);

-- Documentos de ejemplo (puedes borrarlos y crear los tuyos desde el panel)
INSERT INTO documents (code, name, process_id, type_id, consecutive, version, state, origin, is_public) VALUES
  ('GI-GC-MA-01', 'Manual del Sistema Integrado de Gestión', 2, 1, 1, '2.0', 'vigente', 'interno', 1),
  ('GI-DE-PL-01', 'Política Integrada de Gestión',           1, 6, 1, '1.0', 'vigente', 'interno', 1),
  ('GI-GD-PR-01', 'Control de documentos y registros',       10,3, 1, '1.0', 'vigente', 'interno', 1),
  ('GI-GD-FO-01', 'Listado maestro de documentos',           10,5, 1, '1.0', 'vigente', 'interno', 0),
  ('GI-DF-PR-01', 'Diseño y desarrollo de programas de formación', 6, 3, 1, '1.0', 'vigente', 'interno', 1),
  ('GI-CO-PR-01', 'Prestación de consultoría y asesoría',     7, 3, 1, '1.0', 'no_publicado', 'interno', 0);
