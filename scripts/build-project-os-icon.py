from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"
ORIGINAL = ICON_DIR / "project-os-icon-original.png"
SMALL_MASTER = ICON_DIR / "project-os-icon-small-master.png"
OUTPUT = ICON_DIR / "project-os.ico"
VARIANT_DIR = ICON_DIR / "variants"
SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)


def crop_to_artwork(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if not alpha_box:
        raise ValueError("Icon master has no visible pixels")
    return image.crop(alpha_box)


def render_size(master: Image.Image, size: int) -> Image.Image:
    margin = max(1, round(size * 0.025))
    inner = max(1, size - margin * 2)
    artwork = crop_to_artwork(master)
    artwork.thumbnail((inner, inner), Image.Resampling.LANCZOS)

    if size <= 48:
        alpha = artwork.getchannel("A")
        rgb = artwork.convert("RGB")
        rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
        rgb = ImageEnhance.Color(rgb).enhance(1.06)
        rgb = rgb.filter(
            ImageFilter.UnsharpMask(
                radius=max(0.35, size / 64),
                percent=185 if size <= 24 else 145,
                threshold=2,
            )
        )
        artwork = rgb.convert("RGBA")
        artwork.putalpha(alpha)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - artwork.width) // 2
    y = (size - artwork.height) // 2
    canvas.alpha_composite(artwork, (x, y))
    return canvas


def png_payload(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_multi_image_ico(frames: list[tuple[int, Image.Image]]) -> None:
    payloads = [(size, png_payload(image)) for size, image in frames]
    directory_size = 6 + 16 * len(payloads)
    offset = directory_size

    with OUTPUT.open("wb") as icon_file:
        icon_file.write(struct.pack("<HHH", 0, 1, len(payloads)))
        for size, payload in payloads:
            dimension = 0 if size == 256 else size
            icon_file.write(
                struct.pack(
                    "<BBBBHHII",
                    dimension,
                    dimension,
                    0,
                    0,
                    1,
                    32,
                    len(payload),
                    offset,
                )
            )
            offset += len(payload)
        for _, payload in payloads:
            icon_file.write(payload)


def main() -> None:
    original = Image.open(ORIGINAL)
    small_master = Image.open(SMALL_MASTER)
    VARIANT_DIR.mkdir(parents=True, exist_ok=True)

    frames: list[tuple[int, Image.Image]] = []
    for size in SIZES:
        master = small_master if size <= 48 else original
        frame = render_size(master, size)
        frame.save(VARIANT_DIR / f"project-os-{size}.png", optimize=True)
        frames.append((size, frame))

    write_multi_image_ico(frames)
    print(f"Created {OUTPUT} with {len(frames)} optimized sizes")


if __name__ == "__main__":
    main()
