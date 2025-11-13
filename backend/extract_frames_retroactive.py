#!/usr/bin/env python3
"""既存プロジェクトに対して遡ってタグフレームを抽出するスクリプト."""

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import aiofiles


async def extract_frames_for_project(project_dir: Path):
    """プロジェクトディレクトリからタグフレームを抽出する."""

    # リスク評価ファイルを確認
    risk_file = project_dir / "risk_assessment.json"
    if not risk_file.exists():
        print(f"リスク評価ファイルが見つかりません: {project_dir.name}")
        return

    # 動画ファイルを探す
    video_files = list(project_dir.glob("*.mp4")) + list(project_dir.glob("*.mov")) + list(project_dir.glob("*.avi"))
    if not video_files:
        print(f"動画ファイルが見つかりません: {project_dir.name}")
        return

    video_path = video_files[0]
    print(f"\n処理中: {project_dir.name}")
    print(f"  動画: {video_path.name}")

    # リスク評価を読み込む
    async with aiofiles.open(risk_file, "r", encoding="utf-8") as f:
        content = await f.read()
        risk_data = json.loads(content)

    tags = risk_data.get("tags", [])
    if not tags:
        print(f"  タグが見つかりません")
        return

    # タグフレームディレクトリを作成
    frames_dir = project_dir / "tag_frames"
    frames_dir.mkdir(exist_ok=True)

    # タイムコードを収集
    timecodes_to_extract = []

    for tag in tags:
        tag_name = tag.get("name", "unknown")

        # メインタグのタイムコード
        if tag.get("detected_timecode"):
            timecodes_to_extract.append({
                "timecode": tag["detected_timecode"],
                "tag": tag_name,
                "sub_tag": None
            })

        # サブタグのタイムコード
        for sub_tag in tag.get("related_sub_tags", []):
            if sub_tag.get("detected_timecode"):
                timecodes_to_extract.append({
                    "timecode": sub_tag["detected_timecode"],
                    "tag": tag_name,
                    "sub_tag": sub_tag.get("name")
                })

    # 重複を削除
    seen = set()
    unique_timecodes = []
    for item in timecodes_to_extract:
        tc = item["timecode"]
        if tc not in seen:
            seen.add(tc)
            unique_timecodes.append(item)

    print(f"  抽出するフレーム数: {len(unique_timecodes)}")

    # フレームを抽出
    extracted_count = 0
    for item in unique_timecodes:
        timecode = item["timecode"]
        tag = item["tag"]
        sub_tag = item["sub_tag"]

        # タイムコードをファイル名に使える形式に変換
        tc_safe = timecode.replace(":", "-")

        # ファイル名を生成
        if sub_tag:
            filename = f"{tag}_{sub_tag}_{tc_safe}.jpg"
        else:
            filename = f"{tag}_{tc_safe}.jpg"

        # 安全なファイル名に変換
        filename = filename.replace(" ", "_").replace("/", "_")
        output_path = frames_dir / filename

        try:
            # ffmpegでフレームを抽出
            subprocess.run(
                [
                    "ffmpeg",
                    "-ss", timecode,
                    "-i", str(video_path),
                    "-vframes", "1",
                    "-q:v", "2",
                    "-y",
                    str(output_path)
                ],
                check=True,
                capture_output=True,
                timeout=10
            )
            print(f"    ✓ {timecode} -> {filename}")
            extracted_count += 1
        except subprocess.CalledProcessError as e:
            print(f"    ✗ {timecode} エラー: {e.stderr.decode()}")
        except subprocess.TimeoutExpired:
            print(f"    ✗ {timecode} タイムアウト")
        except Exception as e:
            print(f"    ✗ {timecode} エラー: {e}")

    # フレーム情報をJSONに保存
    frames_info = {
        "frames": [
            {
                "timecode": item["timecode"],
                "tag": item["tag"],
                "sub_tag": item["sub_tag"],
                "filename": f"{item['tag']}_{item['sub_tag'] or ''}{('_' if item['sub_tag'] else '')}{item['timecode'].replace(':', '-')}.jpg".replace(" ", "_").replace("/", "_")
            }
            for item in unique_timecodes
        ]
    }

    frames_info_path = project_dir / "tag_frames_info.json"
    async with aiofiles.open(frames_info_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(frames_info, ensure_ascii=False, indent=2))

    print(f"  完了: {extracted_count}/{len(unique_timecodes)} フレーム抽出")


async def main():
    """すべてのプロジェクトを処理する."""
    uploads_dir = Path(__file__).parent / "uploads"

    if not uploads_dir.exists():
        print("uploadsディレクトリが見つかりません")
        sys.exit(1)

    # すべてのプロジェクトディレクトリを取得
    project_dirs = [d for d in uploads_dir.iterdir() if d.is_dir()]

    print(f"見つかったプロジェクト数: {len(project_dirs)}")

    for project_dir in project_dirs:
        try:
            await extract_frames_for_project(project_dir)
        except Exception as e:
            print(f"エラー ({project_dir.name}): {e}")


if __name__ == "__main__":
    asyncio.run(main())
