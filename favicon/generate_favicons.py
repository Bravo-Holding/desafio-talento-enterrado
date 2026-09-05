#!/usr/bin/env python3
"""
Gerador de favicons — Desafio 21 Dias
Círculo laranja #E8420A com letras EB em branco bold.
Requisito: Pillow instalado (pip install Pillow)
"""

from PIL import Image, ImageDraw, ImageFont
import os
import struct
import zlib

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

BG_COLOR = (232, 66, 10, 255)   # #E8420A opaco
TEXT_COLOR = (255, 255, 255, 255)
TEXT = "EB"


def draw_favicon(size: int) -> Image.Image:
    """Desenha círculo laranja com 'EB' centralizado em alta qualidade."""
    scale = 4  # supersampling para anti-alias suave
    ss = size * scale

    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Círculo preenchido
    draw.ellipse([0, 0, ss - 1, ss - 1], fill=BG_COLOR)

    # Fonte: tenta carregar DejaVuSans-Bold (disponível no macOS via Python),
    # senão usa fonte padrão com tamanho estimado.
    font_size = int(ss * 0.38)
    font = None
    font_candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in font_candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, font_size)
                break
            except Exception:
                continue

    if font is None:
        # Fallback: fonte padrão do Pillow (não há como escalar bem, mas funciona)
        font = ImageFont.load_default()

    # Calcular posição centralizada
    bbox = draw.textbbox((0, 0), TEXT, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (ss - tw) / 2 - bbox[0]
    y = (ss - th) / 2 - bbox[1]

    draw.text((x, y), TEXT, font=font, fill=TEXT_COLOR)

    # Reduzir para tamanho final com LANCZOS (melhor anti-alias)
    img = img.resize((size, size), Image.LANCZOS)
    return img


def save_png(img: Image.Image, path: str):
    img.save(path, "PNG", optimize=True)
    print(f"  Gerado: {path}")


def save_ico(sizes: list, path: str):
    """Cria arquivo .ico multi-resolução manualmente."""
    images = [(s, draw_favicon(s)) for s in sizes]

    # Montar ICO header
    num = len(images)
    # Header: 6 bytes
    # Directory entries: 16 bytes cada
    # Image data: PNG de cada tamanho

    png_data_list = []
    for size, img in images:
        import io
        buf = io.BytesIO()
        # ICO 32x32+ aceita PNG internamente
        img.save(buf, "PNG", optimize=True)
        png_data_list.append(buf.getvalue())

    header = struct.pack("<HHH", 0, 1, num)  # reserved, type=1 (ICO), count
    offset = 6 + 16 * num

    directory = b""
    for i, (size, _) in enumerate(images):
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        data_len = len(png_data_list[i])
        directory += struct.pack("<BBBBHHII",
            w, h,        # width, height (0 = 256)
            0,           # color count
            0,           # reserved
            1,           # color planes
            32,          # bits per pixel
            data_len,    # size of image data
            offset       # offset of image data
        )
        offset += data_len

    with open(path, "wb") as f:
        f.write(header)
        f.write(directory)
        for data in png_data_list:
            f.write(data)

    print(f"  Gerado: {path} (multi-size: {[s for s, _ in images]}px)")


if __name__ == "__main__":
    print("Gerando favicons...")

    # PNGs
    configs = [
        (96,  "favicon-96x96.png"),
        (180, "apple-touch-icon.png"),
        (192, "web-app-manifest-192x192.png"),
        (512, "web-app-manifest-512x512.png"),
    ]
    for size, filename in configs:
        img = draw_favicon(size)
        save_png(img, os.path.join(OUTPUT_DIR, filename))

    # ICO multi-size
    save_ico([16, 32, 48], os.path.join(OUTPUT_DIR, "favicon.ico"))

    print("Concluido.")
