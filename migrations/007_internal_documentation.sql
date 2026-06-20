CREATE TABLE IF NOT EXISTS internal_folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NULL,
  name VARCHAR(220) NOT NULL,
  description TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX(parent_id), INDEX(created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS internal_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folder_id INT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  original_file_name VARCHAR(255) NULL,
  stored_file_path VARCHAR(255) NULL,
  mime_type VARCHAR(160) NULL,
  size_bytes BIGINT NULL,
  document_type VARCHAR(120) NULL,
  tags TEXT NULL,
  status VARCHAR(40) DEFAULT 'vigente',
  access_level VARCHAR(40) DEFAULT 'admin_only',
  observations TEXT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX(folder_id), INDEX(uploaded_by), INDEX(status), INDEX(document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS internal_document_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folder_id INT NULL,
  document_id INT NULL,
  actor_user_id INT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(folder_id), INDEX(document_id), INDEX(actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
