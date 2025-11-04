"""アプリ全体で使うロガーの初期化ユーティリティ."""

import logging
from pathlib import Path
from typing import Optional


def setup_logger(name: str, log_file: Optional[Path] = None) -> logging.Logger:
    """ロガーを初期化して返却する。既存のハンドラーがあれば再利用する."""

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    # ルートロガーへのバブルアップを防止
    logger.propagate = False
    return logger
