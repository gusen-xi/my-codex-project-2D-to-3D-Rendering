#!/usr/bin/env python
"""Call the MCKJ Route A OpenAI-compatible image relay."""

from __future__ import annotations

import argparse
import base64
import binascii
import getpass
import io
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path


DEFAULT_BASE_URL = "https://mckj.hk.cn/v1"
DEFAULT_MODEL = "gpt-image-2"
USER_CONFIG_NAME = "mckj-image-route-a.env"
MAX_OUTPUT_BYTES = 50 * 1024 * 1024
MAX_OUTPUT_PIXELS = 64 * 1024 * 1024
ALLOWED_OUTPUT_FORMATS = {"PNG", "JPEG", "WEBP"}


class ImageDeliveryError(RuntimeError):
    pass


def user_config_path() -> Path:
    home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or Path.home())
    return home / ".codex" / USER_CONFIG_NAME


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config(config_path: str | None) -> dict[str, str]:
    values: dict[str, str] = {}
    candidates = [user_config_path(), Path.cwd() / "image-2.env"]
    if os.environ.get("IMAGE_2_CONFIG"):
        candidates.append(Path(os.environ["IMAGE_2_CONFIG"]))
    if config_path:
        candidates.append(Path(config_path))
    for path in candidates:
        values.update(parse_env_file(path))
    for key in ("IMAGE_2_API_KEY", "IMAGE_2_BASE_URL", "IMAGE_2_MODEL"):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def write_env_file(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# MCKJ image route A user configuration.",
        "# Keep this file private; it contains the API key.",
    ]
    for key in ("IMAGE_2_API_KEY", "IMAGE_2_BASE_URL", "IMAGE_2_MODEL"):
        lines.append(f"{key}={values[key]}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def normalize_base_url(base_url: str) -> str:
    # The released client deliberately has one fixed relay address.
    return DEFAULT_BASE_URL


def image_to_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise RuntimeError(f"Unsupported image MIME type for {path}: {mime}")
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def post_json(url: str, api_key: str, body: dict[str, object], timeout: int) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc


def encode_multipart(
    fields: dict[str, object], images: list[Path], mask: Path | None = None
) -> tuple[bytes, str]:
    boundary = f"----mckj-route-a-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("ascii"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )

    image_field = "image[]" if len(images) > 1 else "image"
    for index, path in enumerate(images):
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        if mime not in {"image/png", "image/jpeg", "image/webp"}:
            raise RuntimeError(f"Unsupported image MIME type for {path}: {mime}")
        suffix = path.suffix.lower() if path.suffix else ".png"
        filename = f"image-{index + 1}{suffix}"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("ascii"),
                (
                    f'Content-Disposition: form-data; name="{image_field}"; '
                    f'filename="{filename}"\r\n'
                ).encode("ascii"),
                f"Content-Type: {mime}\r\n\r\n".encode("ascii"),
                path.read_bytes(),
                b"\r\n",
            ]
        )
    if mask is not None:
        chunks.extend([
            f"--{boundary}\r\n".encode("ascii"),
            b'Content-Disposition: form-data; name="mask"; filename="mask.png"\r\n',
            b"Content-Type: image/png\r\n\r\n", mask.read_bytes(), b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode("ascii"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def post_multipart(
    url: str,
    api_key: str,
    fields: dict[str, object],
    images: list[Path],
    timeout: int,
    mask: Path | None = None,
) -> dict[str, object]:
    body, content_type = encode_multipart(fields, images, mask)
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc


def write_output(output: Path, data: bytes) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix(output.suffix + ".part")
    partial.write_bytes(data)
    partial.replace(output)


def validate_image_bytes(data: bytes) -> None:
    if not data:
        raise RuntimeError("返回图片为空。")
    if len(data) > MAX_OUTPUT_BYTES:
        raise RuntimeError("返回图片超过 50 MB（兆字节）上限。")
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ALLOWED_OUTPUT_FORMATS:
                raise RuntimeError(f"不支持的返回图片格式：{image.format or '未知'}。")
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > MAX_OUTPUT_PIXELS:
                raise RuntimeError("返图像素数超过 67108864 上限。")
            image.verify()
    except (OSError, ValueError) as exc:
        raise RuntimeError("返回内容不是有效图片。") from exc


def save_image_response(response: dict[str, object], output: Path, timeout: int) -> None:
    data = response.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise RuntimeError("Response did not include data[0].")
    b64_json = data[0].get("b64_json")
    if isinstance(b64_json, str) and b64_json:
        if len(b64_json) > ((MAX_OUTPUT_BYTES + 2) // 3) * 4:
            raise RuntimeError("返回图片的 Base64（二进制转文本编码）数据过大。")
        try:
            image_bytes = base64.b64decode(b64_json, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise RuntimeError("返回图片的 Base64（二进制转文本编码）数据无效。") from exc
        validate_image_bytes(image_bytes)
        write_output(output, image_bytes)
        return

    image_url = data[0].get("url")
    if isinstance(image_url, str) and image_url.startswith("https://"):
        request = urllib.request.Request(image_url, headers={"User-Agent": "MCP-Image-Receiver/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as image_response:
            image_bytes = image_response.read(MAX_OUTPUT_BYTES + 1)
        validate_image_bytes(image_bytes)
        write_output(output, image_bytes)
        return

    raise RuntimeError("Response did not include data[0].b64_json or data[0].url.")


def build_common_body(args: argparse.Namespace, model: str) -> dict[str, object]:
    body: dict[str, object] = {
        "model": model,
        "prompt": args.prompt,
        "n": 1,
        "response_format": "b64_json",
    }
    if args.size:
        body["size"] = args.size
    if args.quality:
        body["quality"] = args.quality
    if getattr(args, "output_format", None):
        body["output_format"] = args.output_format
    if getattr(args, "output_compression", None) is not None:
        body["output_compression"] = args.output_compression
    if getattr(args, "background", None):
        body["background"] = args.background
    if getattr(args, "moderation", None):
        body["moderation"] = args.moderation
    return body


def configure(args: argparse.Namespace) -> None:
    existing = load_config(args.config)
    api_key = args.api_key or existing.get("IMAGE_2_API_KEY")
    if not api_key:
        api_key = getpass.getpass("IMAGE_2_API_KEY: ").strip()
    base_url = DEFAULT_BASE_URL
    model = DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("IMAGE_2_API_KEY is required.")
    path = Path(args.config) if args.config else user_config_path()
    write_env_file(
        path,
        {"IMAGE_2_API_KEY": api_key, "IMAGE_2_BASE_URL": base_url, "IMAGE_2_MODEL": model},
    )
    print(f"saved persistent config {path}")


def run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    api_key = args.api_key or config.get("IMAGE_2_API_KEY")
    if not api_key:
        raise RuntimeError("Missing IMAGE_2_API_KEY. Set it in the user configuration file.")
    base_url = DEFAULT_BASE_URL
    model = DEFAULT_MODEL
    body = build_common_body(args, model)
    endpoint = "/images/generations"
    if args.command == "base-edit":
        endpoint = "/images/edits"
        response = post_multipart(base_url + endpoint, api_key, body, args.image, args.timeout, getattr(args, "mask", None))
    else:
        if args.command == "reference-generate":
            body["image"] = [image_to_data_url(path) for path in args.image]
        response = post_json(base_url + endpoint, api_key, body, args.timeout)
    try:
        save_image_response(response, args.output, args.timeout)
    except Exception as exc:
        raise ImageDeliveryError("上游已返回图片结果，但本地保存或下载失败。") from exc
    print(f"saved {args.output}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate or edit images through MCKJ Route A.")
    parser.add_argument("--config")
    parser.add_argument("--api-key")
    parser.add_argument("--timeout", type=int, default=1800)
    subparsers = parser.add_subparsers(dest="command", required=True)

    configure_parser = subparsers.add_parser("configure")
    configure_parser.add_argument("--config")
    configure_parser.add_argument("--api-key")
    configure_parser.set_defaults(func=configure)

    def add_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--prompt", required=True)
        subparser.add_argument("--output", type=Path, required=True)
        subparser.add_argument("--size", default="1024x1024")
        subparser.add_argument("--quality", default="low", choices=["low", "medium", "high"])
        subparser.add_argument("--output-format", default="png", choices=["png", "jpeg", "webp"])
        subparser.add_argument("--output-compression", type=int)
        subparser.add_argument("--background", default="auto", choices=["auto", "opaque"])
        subparser.add_argument("--moderation", default="auto", choices=["auto", "low"])

    text = subparsers.add_parser("text-generate")
    add_common(text)
    reference = subparsers.add_parser("reference-generate")
    add_common(reference)
    reference.add_argument("--image", type=Path, action="append", required=True)
    edit = subparsers.add_parser("base-edit")
    add_common(edit)
    edit.add_argument("--image", type=Path, action="append", required=True)
    edit.add_argument("--mask", type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        args.func(args) if hasattr(args, "func") else run(args)
    except ImageDeliveryError as exc:
        print(f"GENERATED_BUT_NOT_SAVED（已生成但未保存）：{exc}", file=sys.stderr)
        sys.exit(3)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
