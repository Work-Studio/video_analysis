# Video Analysis Pipeline

## プロジェクト概要
FastAPI バックエンドと Next.js フロントエンドで構成された動画分析アプリです。動画ファイルのアップロード、Gemini/OpenAI を用いた OCR・文字起こし・リスク評価を行い、結果をフロントから参照できます。

## 必要なツール
- Python 3.11 以上
- Node.js 18 以上 (npm 付き)
- ffmpeg などメディア処理系ツールが必要な場合は別途インストール

## 環境変数
`.env.example` をルートに用意しています。開発前にコピーして値を設定してください。

```bash
cp .env.example .env
# 必要に応じて backend/.env にも同じ内容をコピー
cp .env.example backend/.env
```

| 変数名 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | Gemini API 呼び出し用キー。OCR・文字起こし・映像解析で使用。 |
| `GEMINI_OCR_MODEL` | Gemini の利用モデル。デフォルトは `gemini-2.0-flash-exp`。 |
| `OPENAI_API_KEY` | OpenAI ベースの処理 (例: Whisper) 用 API キー。 |
| `OPENAI_WHISPER_MODEL` | Whisper で利用するモデル名。例: `gpt-4o-transcribe-preview`。 |
| `NEXT_PUBLIC_BACKEND_URL` | フロントエンドがリクエストを送るバックエンドの URL。ローカル開発では `http://localhost:8000`。 |

## バックエンドセットアップ
1. 仮想環境の作成と依存関係のインストール
    ```bash
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    ```
2. FastAPI サーバを起動 (リポジトリルートで実行するとパッケージが解決しやすいです)
    ```bash
    cd /Users/lml25ogk/Desktop/video_analysis  # 例: リポジトリルート
    source backend/.venv/bin/activate
    uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
    ```

## フロントエンドセットアップ
1. 依存関係をインストール
    ```bash
    cd frontend
    npm install
    ```
2. Next.js 開発サーバを起動
    ```bash
    npm run dev -- --port 3000
    ```
3. 必要に応じて `frontend/.env.local` を作成し、`NEXT_PUBLIC_BACKEND_URL` を上書きできます。

## 動作確認
1. バックエンド: `http://localhost:8000/docs` で FastAPI のドキュメントが開けること。
2. フロントエンド: `http://localhost:3000` にアクセスし、動画アップロード → ステータス確認 → レポート表示のフローを試す。

## コミット運用のヒント
- README や `.env.example` のような共有情報を最初にコミットし、次に API や UI の小さな変更を積み上げるとレビューしやすくなります。
- `pytest` と `npm run lint`/`npm run typecheck` を変更単位で流し、ローカルと共有環境で挙動を揃えてください。
