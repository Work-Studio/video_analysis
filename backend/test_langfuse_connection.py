"""Langfuse接続テストスクリプト."""

from dotenv import load_dotenv
from backend.services.langfuse_service import get_langfuse_service

# .envファイルを読み込み
load_dotenv()

def test_connection():
    """Langfuseへの接続をテスト."""
    print("🔍 Langfuse接続テストを開始...")

    langfuse = get_langfuse_service()

    if not langfuse.enabled:
        print("❌ Langfuseが無効化されています")
        print("   backend/.envファイルでLANGFUSE_ENABLED=trueに設定してください")
        return False

    print("✅ Langfuseが有効化されています")

    # トレーステスト
    print("\n📊 トレーステストを実行中...")
    trace_id = langfuse.start_trace(
        name="connection-test",
        metadata={"test": True}
    )

    if trace_id:
        print(f"✅ トレース作成成功: {trace_id}")
    else:
        print("⚠️  トレース作成に失敗（API Keyを確認してください）")

    # 生成ログテスト
    print("\n🤖 生成ログテストを実行中...")
    gen_id = langfuse.log_generation(
        name="test-generation",
        prompt="これはテストプロンプトです",
        model="test-model",
        completion="これはテスト出力です",
        metadata={"test": True}
    )

    if gen_id:
        print(f"✅ 生成ログ記録成功: {gen_id}")
    else:
        print("⚠️  生成ログ記録に失敗")

    # フラッシュ
    print("\n💾 データをフラッシュ中...")
    langfuse.flush()
    print("✅ フラッシュ完了")

    print("\n🎉 接続テスト完了！")
    print("   Langfuseダッシュボード (https://us.cloud.langfuse.com) で")
    print("   'connection-test' トレースが表示されているか確認してください")

    return True


if __name__ == "__main__":
    test_connection()
