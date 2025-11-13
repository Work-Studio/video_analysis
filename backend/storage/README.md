# ストレージ構造ドキュメント

このディレクトリは、将来的にBoxストレージに移行することを想定して、ローカル開発環境で同じ構造を維持しています。

## ディレクトリ構造

```
storage/
├── projects/                           # プロジェクトデータ
│   └── {project_id}/                  # プロジェクトID毎のフォルダ
│       ├── media/                     # 動画・画像ファイル
│       │   └── original.mp4          # アップロードされた元ファイル
│       ├── analysis_results/          # 分析結果
│       │   ├── transcription.txt     # 文字起こし結果
│       │   ├── ocr.txt               # OCR抽出テキスト
│       │   ├── video_analysis.json   # 映像解析結果
│       │   └── risk_assessment.json  # リスク評価結果
│       ├── feedback/                  # フィードバックデータ
│       │   ├── corrections.json      # 管理者による修正内容
│       │   └── quality_scores.json   # 品質スコア
│       ├── reports/                   # 最終レポート
│       │   ├── final_report.json     # 最終レポート
│       │   └── summary.pdf           # PDF出力（将来対応）
│       └── tag_frames/                # タグ関連フレーム画像
│           ├── tag_frames_info.json
│           └── *.jpg                  # 抽出されたフレーム画像
│
├── learning_data/                      # 学習データ（精度向上用）
│   ├── approved_cases/                # 承認された事例
│   │   ├── {case_id}.json            # ケーススタディ
│   │   └── index.json                # インデックス
│   ├── feedback_history/              # フィードバック履歴
│   │   ├── {feedback_id}.json        # フィードバックデータ
│   │   └── monthly/                   # 月次集計
│   │       └── 2025-01.json
│   └── prompts/                       # プロンプトバージョン管理
│       ├── current/                   # 現在使用中
│       │   ├── social_risk.txt
│       │   └── legal_risk.txt
│       └── archive/                   # 過去のバージョン
│           └── v1_20250101/
│
├── reference_data/                     # 参照データ（読み取り専用）
│   ├── social_cases/                  # 炎上事例データベース
│   │   └── 炎上事例.xlsx
│   ├── tag_definitions/               # タグ定義
│   │   └── タグリスト.xlsx
│   └── legal_references/              # 法務参照資料
│       └── JAL　法律リスト.xlsx
│
├── archive/                            # アーカイブ（長期保存）
│   └── {company_name}/
│       └── {product_name}/
│           └── {project_title}_{timestamp}/
│
└── temp/                               # 一時ファイル
    └── uploads/                       # アップロード中の一時ファイル
```

## Box移行時の対応

### 1. ローカル → Box 移行手順

1. Box上で同じフォルダ構造を作成
2. 環境変数を設定（`.env`ファイル）
   ```bash
   STORAGE_TYPE=box  # または local
   BOX_CLIENT_ID=...
   BOX_CLIENT_SECRET=...
   ```
3. ストレージサービスの切り替え（コード変更不要）

### 2. 抽象化レイヤー

`backend/services/storage_service.py` でローカル/Box を抽象化:

```python
if os.getenv('STORAGE_TYPE') == 'box':
    storage = BoxStorage()
else:
    storage = LocalStorage()
```

## 使用例

### プロジェクトデータの保存

```python
from backend.services.storage_service import get_storage

storage = get_storage()

# 分析結果を保存
await storage.save_analysis_result(
    project_id="abc123",
    result_type="risk_assessment",
    data={"social": {...}, "legal": {...}}
)

# フィードバックを保存
await storage.save_feedback(
    project_id="abc123",
    feedback_data={...}
)
```

### 学習データの取得

```python
# 承認された事例を取得
cases = await storage.get_approved_cases(
    tag_name="女性表現",
    limit=10
)
```

## 注意事項

- **`temp/` フォルダ**: 定期的にクリーンアップされます（24時間後に自動削除）
- **`archive/` フォルダ**: プロジェクト完了時に自動的にコピーされます
- **参照データ**: 手動で最新版に更新する必要があります

## バックアップ

ローカル環境では、`storage/` ディレクトリ全体を定期的にバックアップしてください。

Box移行後は、Boxの自動バックアップ機能が利用できます。
