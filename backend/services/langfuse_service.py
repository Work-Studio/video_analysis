"""Langfuse統合サービス - AI分析のトレーシングとプロンプト管理."""

import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class LangfuseService:
    """Langfuse統合のラッパーサービス."""

    def __init__(self):
        """Initialize Langfuse client."""
        self.enabled = os.getenv("LANGFUSE_ENABLED", "false").lower() == "true"
        self.client = None
        self.current_trace = None

        if self.enabled:
            try:
                from langfuse import Langfuse

                self.client = Langfuse(
                    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
                )
                print("[Langfuse] Initialized successfully")
            except ImportError:
                print("[Langfuse] Library not installed, disabling integration")
                self.enabled = False
            except Exception as e:
                print(f"[Langfuse] Failed to initialize: {e}")
                self.enabled = False

    def start_trace(
        self,
        name: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """新しいトレースを開始."""
        if not self.enabled or not self.client:
            return None

        try:
            self.current_trace = self.client.trace(
                name=name,
                user_id=user_id,
                session_id=session_id,
                metadata=metadata or {}
            )
            return self.current_trace.id
        except Exception as e:
            print(f"[Langfuse] Failed to start trace: {e}")
            return None

    def log_generation(
        self,
        name: str,
        prompt: str,
        model: str,
        completion: str,
        metadata: Optional[Dict[str, Any]] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_cost: Optional[float] = None
    ) -> Optional[str]:
        """AI生成をログに記録."""
        if not self.enabled or not self.client:
            return None

        try:
            trace = self.current_trace or self.client.trace(name="generation")
            generation = trace.generation(
                name=name,
                model=model,
                input=prompt,
                output=completion,
                metadata=metadata or {},
                usage={
                    "input": input_tokens or 0,
                    "output": output_tokens or 0,
                    "total": (input_tokens or 0) + (output_tokens or 0)
                } if input_tokens or output_tokens else None,
                level="DEFAULT"
            )
            return generation.id
        except Exception as e:
            print(f"[Langfuse] Failed to log generation: {e}")
            return None

    def log_span(
        self,
        name: str,
        input_data: Optional[Dict[str, Any]] = None,
        output_data: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """処理スパンをログに記録."""
        if not self.enabled or not self.client:
            return None

        try:
            trace = self.current_trace or self.client.trace(name="span")
            span = trace.span(
                name=name,
                input=input_data,
                output=output_data,
                metadata=metadata or {}
            )
            return span.id
        except Exception as e:
            print(f"[Langfuse] Failed to log span: {e}")
            return None

    def score_generation(
        self,
        trace_id: str,
        name: str,
        value: float,
        comment: Optional[str] = None
    ) -> bool:
        """生成結果にスコアを付与."""
        if not self.enabled or not self.client:
            return False

        try:
            self.client.score(
                trace_id=trace_id,
                name=name,
                value=value,
                comment=comment
            )
            return True
        except Exception as e:
            print(f"[Langfuse] Failed to score generation: {e}")
            return False

    def end_trace(self) -> None:
        """現在のトレースを終了."""
        if self.current_trace:
            try:
                self.current_trace.update(status="completed")
                self.current_trace = None
            except Exception as e:
                print(f"[Langfuse] Failed to end trace: {e}")

    def get_prompt(self, name: str, version: Optional[int] = None) -> Optional[str]:
        """Langfuseからプロンプトを取得."""
        if not self.enabled or not self.client:
            return None

        try:
            prompt = self.client.get_prompt(name, version=version)
            return prompt.prompt if prompt else None
        except Exception as e:
            print(f"[Langfuse] Failed to get prompt: {e}")
            return None

    def compile_prompt(self, name: str, variables: Dict[str, Any], version: Optional[int] = None) -> Optional[str]:
        """Langfuseからプロンプトを取得して変数を置き換え."""
        if not self.enabled or not self.client:
            return None

        try:
            prompt_obj = self.client.get_prompt(name, version=version)
            if not prompt_obj:
                return None

            # プロンプトテキストを取得
            prompt_text = prompt_obj.prompt

            # 変数を置き換え
            for key, value in variables.items():
                placeholder = "{{" + key + "}}"
                prompt_text = prompt_text.replace(placeholder, str(value))

            return prompt_text
        except Exception as e:
            print(f"[Langfuse] Failed to compile prompt: {e}")
            return None

    def flush(self) -> None:
        """バッファされたイベントをフラッシュ."""
        if self.enabled and self.client:
            try:
                self.client.flush()
            except Exception as e:
                print(f"[Langfuse] Failed to flush: {e}")


# Global Langfuse service instance
_langfuse_service: Optional[LangfuseService] = None


def get_langfuse_service() -> LangfuseService:
    """Langfuseサービスのシングルトンインスタンスを取得."""
    global _langfuse_service
    if _langfuse_service is None:
        _langfuse_service = LangfuseService()
    return _langfuse_service
