-- MySQL 8.4；先选择 wuyin 数据库。只增加会话表，不修改既有账号和业务表。
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '标签页随机令牌的SHA256摘要，不保存原始令牌',
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME(3) NOT NULL COMMENT 'UTC过期时间',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    KEY idx_auth_sessions_user (user_id),
    KEY idx_auth_sessions_expiry (expires_at),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='JavaScript后端登录会话';
