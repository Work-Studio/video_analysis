-- 分析結果のフィードバックを保存するテーブル
-- SQLite用スキーマ

-- 1. 分析結果のフィードバックテーブル
CREATE TABLE IF NOT EXISTS analysis_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    analysis_version TEXT NOT NULL,  -- 分析実行時のバージョン/タイムスタンプ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,  -- 管理者ユーザーID
    feedback_type TEXT CHECK(feedback_type IN ('approve', 'modify', 'reject')),
    overall_quality_score INTEGER CHECK(overall_quality_score BETWEEN 1 AND 5),
    notes TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 2. タグ検出結果のフィードバック
CREATE TABLE IF NOT EXISTS tag_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    tag_name TEXT NOT NULL,
    sub_tag_name TEXT,
    original_grade TEXT,  -- AI が検出したグレード
    corrected_grade TEXT,  -- 管理者が修正したグレード
    original_timecode TEXT,
    corrected_timecode TEXT,
    original_reason TEXT,
    corrected_reason TEXT,
    action TEXT CHECK(action IN ('keep', 'modify', 'delete', 'add')),
    confidence_score REAL,  -- AI の信頼度スコア
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES analysis_feedback(id) ON DELETE CASCADE
);

-- 3. プロンプト改善のための学習データ
CREATE TABLE IF NOT EXISTS prompt_improvements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_name TEXT NOT NULL,
    sub_tag_name TEXT,
    improvement_type TEXT CHECK(improvement_type IN ('example_add', 'rule_add', 'context_update')),
    before_prompt TEXT,
    after_prompt TEXT,
    effectiveness_score REAL,  -- 改善効果のスコア
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 4. ケーススタディの追加学習
CREATE TABLE IF NOT EXISTS custom_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_name TEXT NOT NULL,
    sub_tag_name TEXT,
    case_description TEXT NOT NULL,
    video_content_summary TEXT,  -- 該当動画の内容要約
    detected_expressions TEXT,  -- 検出された表現
    risk_level TEXT CHECK(risk_level IN ('A', 'B', 'C', 'D', 'E')),
    source_project_id TEXT,  -- 元となったプロジェクトID
    is_approved BOOLEAN DEFAULT 0,  -- 学習データとして承認済みか
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. 分析精度のメトリクス
CREATE TABLE IF NOT EXISTS analysis_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    analysis_version TEXT NOT NULL,
    precision_score REAL,  -- 適合率
    recall_score REAL,  -- 再現率
    f1_score REAL,
    consistency_score REAL,  -- 一貫性スコア
    false_positive_count INTEGER DEFAULT 0,
    false_negative_count INTEGER DEFAULT 0,
    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. タグ検出パターンの学習
CREATE TABLE IF NOT EXISTS tag_detection_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_name TEXT NOT NULL,
    sub_tag_name TEXT,
    detection_pattern TEXT NOT NULL,  -- 検出パターン（正規表現やキーワード）
    context_keywords TEXT,  -- 文脈キーワード（JSON配列）
    negative_keywords TEXT,  -- 除外キーワード（JSON配列）
    weight REAL DEFAULT 1.0,  -- パターンの重み
    success_count INTEGER DEFAULT 0,  -- 成功回数
    failure_count INTEGER DEFAULT 0,  -- 失敗回数
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_analysis_feedback_project ON analysis_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_tag_feedback_feedback_id ON tag_feedback(feedback_id);
CREATE INDEX IF NOT EXISTS idx_tag_feedback_tag ON tag_feedback(tag_name, sub_tag_name);
CREATE INDEX IF NOT EXISTS idx_custom_cases_tag ON custom_cases(tag_name, sub_tag_name);
CREATE INDEX IF NOT EXISTS idx_custom_cases_approved ON custom_cases(is_approved);
CREATE INDEX IF NOT EXISTS idx_detection_patterns_tag ON tag_detection_patterns(tag_name, sub_tag_name);
CREATE INDEX IF NOT EXISTS idx_detection_patterns_active ON tag_detection_patterns(is_active);
