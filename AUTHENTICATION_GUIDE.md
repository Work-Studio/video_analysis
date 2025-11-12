# Creative Guard 認証システム実装ガイド

## 概要

Creative Guardに以下の認証・ユーザー管理機能を実装しました：

- ログイン・認証システム
- 初回パスワード変更機能
- 管理者によるユーザー管理
- プロジェクト削除機能
- CSV一括アップロード機能（基本実装）

## 実装内容

### バックエンド

#### 1. データベース ([backend/database.py](backend/database.py))

SQLiteを使用したユーザー管理テーブル：

- **users テーブル**
  - id: ユーザーID（自動採番）
  - email: メールアドレス（ユニーク）
  - company_name: 会社名
  - password_hash: パスワードハッシュ
  - is_admin: 管理者フラグ
  - requires_password_change: パスワード変更要求フラグ
  - created_at, updated_at: タイムスタンプ

- **user_projects テーブル**
  - ユーザーとプロジェクトの紐付け

#### 2. 認証システム ([backend/auth.py](backend/auth.py))

- bcryptによるパスワードハッシュ化
- JWT トークン生成・検証（有効期限: 7日間）
- ランダムパスワード生成

#### 3. API エンドポイント

##### 認証API ([backend/routers/auth.py](backend/routers/auth.py))

```
POST /auth/login
  - ログイン
  - レスポンス: アクセストークン、ユーザー情報

POST /auth/change-password
  - パスワード変更（要認証）

GET /auth/me
  - 現在のユーザー情報取得（要認証）
```

##### 管理者API ([backend/routers/admin.py](backend/routers/admin.py))

```
POST /admin/users
  - ユーザー作成（管理者のみ）
  - 初回パスワードを自動生成

GET /admin/users
  - ユーザー一覧取得（管理者のみ）

DELETE /admin/users/{user_id}
  - ユーザー削除（管理者のみ）
```

##### プロジェクトAPI ([backend/app.py](backend/app.py))

```
DELETE /projects/{project_id}
  - プロジェクト削除（要認証）
  - ファイルとデータベースから完全削除
```

##### 一括アップロードAPI ([backend/routers/bulk_upload.py](backend/routers/bulk_upload.py))

```
POST /bulk/upload-csv
  - CSV形式で複数プロジェクトを一括登録（要認証）
```

### フロントエンド

#### 1. ログイン画面 ([frontend/src/app/login/page.tsx](frontend/src/app/login/page.tsx))

- メールアドレスとパスワードでログイン
- トークンとユーザー情報をlocalStorageに保存
- 初回ログイン時は自動的にパスワード変更画面へ遷移

#### 2. パスワード変更画面 ([frontend/src/app/change-password/page.tsx](frontend/src/app/change-password/page.tsx))

- 現在のパスワードと新しいパスワードを入力
- 8文字以上のバリデーション
- 変更完了後はホームへ遷移

#### 3. 管理者画面 ([frontend/src/app/admin/page.tsx](frontend/src/app/admin/page.tsx))

- ユーザー一覧表示
- 新規ユーザー作成
  - メールアドレスと会社名を入力
  - 初回パスワードを自動生成・表示
  - クリップボードにコピー可能
- ユーザー削除（管理者以外）

#### 4. APIクライアント拡張 ([frontend/src/lib/apiClient.ts](frontend/src/lib/apiClient.ts))

認証関連のAPI関数を追加：

- `login()` - ログイン
- `changePassword()` - パスワード変更
- `getCurrentUser()` - ユーザー情報取得
- `createUser()` - ユーザー作成
- `fetchUsers()` - ユーザー一覧取得
- `deleteUser()` - ユーザー削除
- `deleteProject()` - プロジェクト削除

## 初期セットアップ

### 1. 必要なパッケージのインストール

```bash
cd backend
pip install bcrypt PyJWT
```

### 2. 初期管理者ユーザーの作成

```bash
cd /Users/lml25ogk/Desktop/video_analysis
python -m backend.create_admin admin@creativeguard.com <password>
```

### 3. サーバー起動

```bash
# バックエンド
cd backend
uvicorn app:app --reload

# フロントエンド
cd frontend
npm run dev
```

## 使用フロー

### 管理者フロー

1. `/login` でログイン
2. `/admin` で管理者画面にアクセス
3. 新規ユーザーを作成
4. 生成された初回パスワードを依頼主に共有

### 一般ユーザーフロー

1. `/login` で初回パスワードを使用してログイン
2. `/change-password` に自動遷移
3. 新しいパスワードを設定
4. `/` (ホーム) に遷移してプロジェクト作成・分析

### プロジェクト削除

1. プロジェクト一覧から削除したいプロジェクトを選択
2. 削除ボタンをクリック
3. 確認ダイアログで「はい」を選択
4. ファイルとデータベースから完全削除

## CSV一括アップロード

### CSVフォーマット

```csv
company_name,product_name,title,file_path
株式会社サンプル,商品A,キャンペーン1,/path/to/video1.mp4
株式会社テスト,商品B,キャンペーン2,/path/to/video2.mp4
```

### 使用方法

1. 上記フォーマットでCSVファイルを作成
2. `/bulk/upload-csv` エンドポイントにPOST
3. 各行がプロジェクトとして登録される

## セキュリティ考慮事項

- パスワードはbcryptでハッシュ化して保存
- JWTトークンで認証状態を管理
- 初回ログイン時は必ずパスワード変更を要求
- 管理者のみがユーザー管理にアクセス可能
- プロジェクト削除は作成者または管理者のみ

## 今後の改善提案

1. **メール送信機能**: ユーザー作成時に初回パスワードを自動送信
2. **パスワードリセット**: パスワード忘れた場合のリセット機能
3. **セッション管理**: リフレッシュトークンによる自動更新
4. **監査ログ**: ユーザーアクション履歴の記録
5. **CSV一括アップロード完全実装**: ファイルのコピーとプロジェクト作成
6. **プロジェクトアクセス制御**: ユーザーごとのプロジェクト表示制限

## トラブルシューティング

### ログインできない

- データベース(creative_guard.db)が作成されているか確認
- 初期管理者ユーザーが作成されているか確認

### トークンエラー

- localStorageのaccess_tokenを削除して再ログイン
- バックエンドのSECRET_KEYが変更されていないか確認

### データベースリセット

```bash
cd backend
rm creative_guard.db
python -m backend.database  # 初期化
python -m backend.create_admin admin@example.com password
```

## 参考ファイル

- バックエンド
  - [backend/database.py](backend/database.py) - データベース定義
  - [backend/auth.py](backend/auth.py) - 認証ユーティリティ
  - [backend/routers/auth.py](backend/routers/auth.py) - 認証API
  - [backend/routers/admin.py](backend/routers/admin.py) - 管理者API
  - [backend/routers/bulk_upload.py](backend/routers/bulk_upload.py) - 一括アップロードAPI
  - [backend/create_admin.py](backend/create_admin.py) - 管理者作成スクリプト

- フロントエンド
  - [frontend/src/app/login/page.tsx](frontend/src/app/login/page.tsx) - ログイン画面
  - [frontend/src/app/change-password/page.tsx](frontend/src/app/change-password/page.tsx) - パスワード変更画面
  - [frontend/src/app/admin/page.tsx](frontend/src/app/admin/page.tsx) - 管理者画面
  - [frontend/src/lib/apiClient.ts](frontend/src/lib/apiClient.ts) - APIクライアント
