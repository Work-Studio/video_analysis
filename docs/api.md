# API ドキュメント

FastAPI バックエンドが提供する REST API の概要と主要エンドポイントを整理します。ドキュメントは開発中の仕様を正確に反映することを目的としており、機能追加やパラメータ変更時は本ファイルを更新してください。

## OpenAPI 定義の取得
1. バックエンドを起動: `uvicorn backend.app:app --reload`
2. ブラウザまたは `curl` で `http://localhost:8000/openapi.json` にアクセス
3. ファイルとして保存したい場合: `curl http://localhost:8000/openapi.json -o docs/openapi.json`
4. Swagger UI (`/docs`) と Redoc (`/redoc`) も同じサーバで利用できます

## ベース URL と共通設定
| 環境 | ベース URL | 備考 |
| --- | --- | --- |
| ローカル | `http://localhost:8000` | `uvicorn backend.app:app --reload` を想定 |
| フロントエンド | `NEXT_PUBLIC_BACKEND_URL` | Next.js から API を叩くときに使用。デフォルトは `http://localhost:8000` |

- 認証ヘッダは現状不要です。必要になった場合はここで追加手順を定義します。
- CORS は `allow_origins=["*"]` で開発用に全許可 (`backend/app.py:46-52`)。本番環境では必要なオリジンに絞ってください。

## 必須環境変数
| 変数名 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | Gemini API (OCR/字幕/映像解析) で使用。指定しない場合はスタブレスポンス。 |
| `GEMINI_OCR_MODEL` | 利用する Gemini モデル名。既定値 `gemini-2.0-flash-exp`。 |
| `OPENAI_API_KEY` | Whisper など OpenAI 連携時に使用。指定しない場合は該当処理がスタブ化。 |
| `OPENAI_WHISPER_MODEL` | Whisper モデル名 (例: `gpt-4o-transcribe-preview`)。 |

`.env.example` をルートに置いているので、`cp .env.example .env` などで複製して設定します。

## エンドポイント一覧
| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/projects` | 動画とメタデータをアップロードし、新規プロジェクトを作成 |
| `GET` | `/projects` | プロジェクト一覧を取得 |
| `POST` | `/projects/{project_id}/analyze` | バックグラウンドで分析パイプラインを開始 |
| `GET` | `/projects/{project_id}/analysis-status` | 分析進行状況とログを取得 |
| `GET` | `/projects/{project_id}/report` | 最終レポートを取得 (未生成時は 404) |
| `GET` | `/projects/{project_id}/media` | 元メディアファイルをダウンロード |
| `GET` | `/health` | ヘルスチェック |

以下では主要エンドポイントの入出力・エラーを詳述します。

### POST /projects
- **概要**: `multipart/form-data` の動画ファイルと会社名等を受け取り、`ProjectStore` に登録
- **フィールド**
  - `company_name` (string, required)
  - `product_name` (string, required)
  - `title` (string, required)
  - `model` (string, optional, default: `default`)
  - `video_file` (binary, required)
- **レスポンス例** (`ProjectCreatedResponse`)
```json
{
  "id": "6f5f4c2e95d84f7182b0d8c6ec5a8bb3",
  "company_name": "Acme",
  "product_name": "Wonder Drink",
  "title": "New CM",
  "model": "default",
  "file_name": "wonder.mp4",
  "media_type": "video/mp4",
  "media_url": "/projects/6f5f4c2e95d84f7182b0d8c6ec5a8bb3/media",
  "status": "pending",
  "analysis_progress": 0.0,
  "created_at": "2024-06-01T12:34:56.123456"
}
```
- **エラーレスポンス**
  - 400: `video_file` 未指定
  - 500: Gemini/ストレージなど内部エラー

### GET /projects
- **概要**: `ProjectStore` 内の全件を返却
- **レスポンス**: `ProjectSummary` の配列
  - 進捗 (`analysis_progress`)、`status`、`media_url` などを含む

### POST /projects/{project_id}/analyze
- **概要**: `AnalysisPipeline.run` をバックグラウンド実行に登録
- **レスポンス例**
```json
{"message": "分析を開始しました。", "project_id": "6f5f4c2e95d84f7182b0d8c6ec5a8bb3"}
```
- **エラー**
  - 404: プロジェクトが存在しない
  - 409: すでに分析中 (`PipelineAlreadyRunningError`)

### GET /projects/{project_id}/analysis-status
- **概要**: 進行中または完了済みのステップ情報 (`PROJECT_STEPS`) とログを返す
- **レスポンス**: `ProjectStatusResponse`
  - `steps`: `name`, `status (pending|running|completed|failed)`, `payload.preview`
  - `logs`: パイプラインが記録した文字列配列
  - `analysis_started_at`, `analysis_completed_at`, `analysis_duration_seconds`
- **エラー**: 404 (存在しない ID)

### GET /projects/{project_id}/report
- **概要**: `final_report` が生成済みの場合のみ返却
- **レスポンス**: `ProjectReportResponse`
  - `final_report.summary`, `sections` (transcription/ocr/video_analysis), `files` (結果ファイルパス)
  - `risk`: 社会的リスク/法務リスク/タグ情報/リスクマトリクス
- **エラー**
  - 404: プロジェクト未存在 or レポート未生成 (`"detail": "レポートはまだ利用できません。"`)

### GET /projects/{project_id}/media
- **概要**: `FileResponse` でアップロード済みメディアをストリーミング
- **エラー**
  - 404: プロジェクト未存在 or ファイル欠損

### GET /health
- **概要**: アプリ起動確認用の軽量エンドポイント
- **レスポンス**: `{ "status": "ok" }`

## エラー設計メモ
- FastAPI からの例外は `detail` を含む JSON で返り、`HTTPException` のステータスコードに準じます。
- Gemini/OpenAI の API 呼び出し失敗時は 500 系エラーとなり、ログに詳細が出力されます。
- 大容量ファイルのアップロード制限やタイムアウトは `uvicorn`/`Starlette` の設定値に依存するため、必要に応じて `app.add_middleware` で制御してください。

## 変更時のチェックリスト
1. 新しいエンドポイントやフィールドを追加したら `docs/api.md` と `.env.example` を更新
2. `pytest` で関連テストを追加し、`/openapi.json` が期待どおりか確認
3. README に利用手順の差分が必要かレビュー
4. フロントエンド (`frontend/src/lib/apiClient.ts`) が追加フィールドを扱えているか確認

このファイルは GitHub 上でレビューしやすいよう Markdown で管理しています。仕様変更の PR では必ず差分に含めてください。
