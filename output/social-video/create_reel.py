from __future__ import annotations

import math
import os
import subprocess
import sys
import wave
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


W, H = 720, 1280
FPS = 30
DURATION = 19.5
LIME = (174, 255, 0)
WHITE = (248, 248, 248)
BLACK = (8, 10, 13)
GRAY = (196, 201, 207)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "social-video"
TOOLS = OUT / ".tools"

PHOTOS = {
    "damage_wide": Path(r"C:\Users\south\Downloads\151.jpg"),
    "damage_tight": Path(r"C:\Users\south\Downloads\153.png"),
    "repair": Path(r"C:\Users\south\Downloads\181.jpg"),
    "after_close": Path(r"C:\Users\south\Downloads\183.jpg"),
    "after_wide": Path(r"C:\Users\south\Downloads\182.jpg"),
}
LOGO = ROOT / "public" / "brand" / "youtube-profile-v2.png"

FONT_IMPACT = Path(r"C:\Windows\Fonts\impact.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")
FONT_REGULAR = Path(r"C:\Windows\Fonts\arial.ttf")


@lru_cache(maxsize=64)
def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease_out(value: float) -> float:
    value = clamp(value)
    return 1 - (1 - value) ** 3


def ease_in_out(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def fade_for(local_t: float, duration: float, edge: float = 0.20) -> float:
    return min(clamp(local_t / edge), clamp((duration - local_t) / edge))


def load_corrected(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if image.height > 1700:
        scale = 1700 / image.height
        image = image.resize((round(image.width * scale), 1700), Image.Resampling.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image = ImageEnhance.Color(image).enhance(0.92)
    image = ImageEnhance.Sharpness(image).enhance(1.15)
    return image


def cover_crop(image: Image.Image, zoom: float, focus_x: float, focus_y: float) -> Image.Image:
    # Cover the 9:16 frame and animate a subtle Ken Burns push.
    scale = max(W / image.width, H / image.height) * zoom
    rw = max(W, round(image.width * scale))
    rh = max(H, round(image.height * scale))
    resized = image.resize((rw, rh), Image.Resampling.LANCZOS)
    max_x = rw - W
    max_y = rh - H
    left = round(clamp(focus_x) * max_x)
    top = round(clamp(focus_y) * max_y)
    return resized.crop((left, top, left + W, top + H))


@lru_cache(maxsize=4)
def vignette_overlay(top_strength: int = 150, bottom_strength: int = 195) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(H):
        top = max(0.0, 1.0 - y / 330.0) * top_strength
        bottom = max(0.0, (y - (H - 470)) / 470.0) * bottom_strength
        alpha = int(clamp((top + bottom) / 255.0) * 255)
        draw.line((0, y, W, y), fill=(0, 0, 0, min(220, alpha)))
    edge = Image.new("L", (W, 1), 0)
    edge_px = edge.load()
    for x in range(W):
        distance = abs(x - W / 2) / (W / 2)
        edge_px[x, 0] = int(42 * distance**2)
    edge = edge.resize((W, H))
    edge_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    edge_layer.putalpha(edge)
    return Image.alpha_composite(overlay, edge_layer)


def add_vignette(image: Image.Image, top_strength: int = 150, bottom_strength: int = 195) -> Image.Image:
    return Image.alpha_composite(image.convert("RGBA"), vignette_overlay(top_strength, bottom_strength))


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, stroke: int = 0) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    return box[2] - box[0], box[3] - box[1]


def centered_text(
    canvas: Image.Image,
    text: str,
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill=WHITE,
    stroke=BLACK,
    stroke_width: int = 5,
    alpha: float = 1.0,
    tracking: int = 0,
) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    if tracking <= 0:
        tw, _ = text_size(draw, text, fnt, stroke_width)
        draw.text(
            ((W - tw) / 2, y),
            text,
            font=fnt,
            fill=(*fill[:3], int(255 * alpha)),
            stroke_width=stroke_width,
            stroke_fill=(*stroke[:3], int(255 * alpha)),
        )
    else:
        widths = [draw.textlength(ch, font=fnt) for ch in text]
        total = sum(widths) + tracking * max(0, len(text) - 1)
        x = (W - total) / 2
        for ch, width in zip(text, widths):
            draw.text(
                (x, y),
                ch,
                font=fnt,
                fill=(*fill[:3], int(255 * alpha)),
                stroke_width=stroke_width,
                stroke_fill=(*stroke[:3], int(255 * alpha)),
            )
            x += width + tracking
    canvas.alpha_composite(layer)


def label(canvas: Image.Image, text: str, y: int, fill=LIME, text_fill=BLACK, alpha: float = 1.0) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    fnt = font(FONT_BOLD, 28)
    tw, th = text_size(draw, text, fnt)
    x1 = (W - tw) // 2 - 20
    x2 = (W + tw) // 2 + 20
    draw.rounded_rectangle((x1, y, x2, y + th + 22), radius=13, fill=(*fill, int(245 * alpha)))
    draw.text(((W - tw) / 2, y + 8), text, font=fnt, fill=(*text_fill, int(255 * alpha)))
    canvas.alpha_composite(layer)


def progress_bar(canvas: Image.Image, t: float) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, 8), fill=(25, 25, 25, 220))
    draw.rectangle((0, 0, int(W * clamp(t / DURATION)), 8), fill=(*LIME, 255))


def photo_scene(image: Image.Image, local_t: float, duration: float, focus: tuple[float, float], zoom_end: float = 1.09) -> Image.Image:
    zoom = 1.0 + (zoom_end - 1.0) * ease_in_out(local_t / duration)
    frame = cover_crop(image, zoom, focus[0], focus[1])
    frame = add_vignette(frame)
    opacity = fade_for(local_t, duration)
    if opacity < 1:
        black = Image.new("RGBA", (W, H), (*BLACK, 255))
        frame = Image.blend(black, frame, opacity)
    return frame


def draw_scene(t: float, photos: dict[str, Image.Image], logo: Image.Image) -> Image.Image:
    # 0.0-2.2: instant visual hook.
    if t < 2.2:
        lt, dur = t, 2.2
        frame = photo_scene(photos["damage_wide"], lt, dur, (0.50, 0.62), 1.12)
        label(frame, "ACTUAL JOB • BEFORE", 88, alpha=ease_out(lt / 0.35))
        y = int(205 - 45 * (1 - ease_out(lt / 0.45)))
        centered_text(frame, "ONE BROKEN TILE...", y, font(FONT_IMPACT, 66), alpha=ease_out(lt / 0.40))
        centered_text(frame, "CAN MAKE THE WHOLE SHOWER", 1000, font(FONT_BOLD, 29), stroke_width=4, alpha=ease_out((lt - 0.75) / 0.35))
        centered_text(frame, "LOOK BAD", 1045, font(FONT_IMPACT, 48), fill=LIME, stroke_width=4, alpha=ease_out((lt - 0.90) / 0.35))

    # 2.2-4.3: tighter, higher-stakes question.
    elif t < 4.3:
        lt, dur = t - 2.2, 2.1
        frame = photo_scene(photos["damage_tight"], lt, dur, (0.50, 0.49), 1.10)
        centered_text(frame, "REPLACE", 160, font(FONT_IMPACT, 90), fill=WHITE, alpha=ease_out(lt / 0.30))
        centered_text(frame, "THE WHOLE WALL?", 255, font(FONT_IMPACT, 74), fill=LIME, alpha=ease_out((lt - 0.12) / 0.30))
        centered_text(frame, "For one damaged tile?", 1040, font(FONT_BOLD, 36), stroke_width=4, alpha=ease_out((lt - 0.65) / 0.35))

    # 4.3-5.3: pattern interrupt.
    elif t < 5.3:
        lt, dur = t - 4.3, 1.0
        pulse = 1.0 + 0.06 * math.sin(math.pi * clamp(lt / 0.35))
        frame = Image.new("RGBA", (W, H), (*BLACK, 255))
        fnt = font(FONT_IMPACT, int(180 * pulse))
        centered_text(frame, "NOPE.", 475, fnt, fill=LIME, stroke_width=0, alpha=ease_out(lt / 0.15))
        centered_text(frame, "A SMALL REPAIR CAN SAVE IT.", 675, font(FONT_BOLD, 31), fill=WHITE, stroke_width=0, alpha=ease_out((lt - 0.20) / 0.20), tracking=1)

    # 5.3-8.2: repair/test-fit evidence.
    elif t < 8.2:
        lt, dur = t - 5.3, 2.9
        frame = photo_scene(photos["repair"], lt, dur, (0.50, 0.60), 1.11)
        label(frame, "PRECISION REPAIR", 100, alpha=ease_out(lt / 0.30))
        centered_text(frame, "MATCHED.", 915, font(FONT_IMPACT, 86), alpha=ease_out((lt - 0.35) / 0.30))
        centered_text(frame, "FITTED.", 1005, font(FONT_IMPACT, 86), fill=LIME, alpha=ease_out((lt - 0.75) / 0.30))

    # 8.2-11.2: repaired surface.
    elif t < 11.2:
        lt, dur = t - 8.2, 3.0
        frame = photo_scene(photos["after_close"], lt, dur, (0.50, 0.54), 1.09)
        label(frame, "AFTER", 92, alpha=ease_out(lt / 0.30))
        centered_text(frame, "CLEAN.", 930, font(FONT_IMPACT, 92), alpha=ease_out((lt - 0.25) / 0.30))
        centered_text(frame, "SOLID. FINISHED.", 1028, font(FONT_IMPACT, 66), fill=LIME, alpha=ease_out((lt - 0.65) / 0.30))

    # 11.2-14.2: wide reveal and signature promise.
    elif t < 14.2:
        lt, dur = t - 11.2, 3.0
        frame = photo_scene(photos["after_wide"], lt, dur, (0.50, 0.52), 1.06)
        centered_text(frame, "SMALL FIX.", 175, font(FONT_IMPACT, 98), alpha=ease_out(lt / 0.35))
        centered_text(frame, "BIG DIFFERENCE.", 278, font(FONT_IMPACT, 82), fill=LIME, alpha=ease_out((lt - 0.18) / 0.35))
        centered_text(frame, "Would you have replaced the whole wall?", 1050, font(FONT_BOLD, 29), stroke_width=4, alpha=ease_out((lt - 0.85) / 0.35))

    # 14.2-16.5: visual before/after proof.
    elif t < 16.5:
        lt, dur = t - 14.2, 2.3
        frame = Image.new("RGBA", (W, H), (*BLACK, 255))
        before = cover_crop(photos["damage_wide"], 1.06, 0.50, 0.62).crop((0, 0, W, H // 2 - 8))
        after_full = cover_crop(photos["after_wide"], 1.04, 0.50, 0.52)
        after = after_full.crop((0, H // 2 + 8, W, H))
        frame.alpha_composite(before.convert("RGBA"), (0, 0))
        frame.alpha_composite(after.convert("RGBA"), (0, H // 2 + 8))
        draw = ImageDraw.Draw(frame)
        draw.rectangle((0, H // 2 - 8, W, H // 2 + 8), fill=(*LIME, 255))
        label(frame, "BEFORE", 55, fill=(240, 240, 240), text_fill=BLACK, alpha=ease_out(lt / 0.25))
        label(frame, "AFTER", H // 2 + 45, fill=LIME, text_fill=BLACK, alpha=ease_out((lt - 0.18) / 0.25))
        centered_text(frame, "THE DETAILS MATTER.", 1120, font(FONT_IMPACT, 58), fill=WHITE, alpha=ease_out((lt - 0.50) / 0.30))
        if fade_for(lt, dur) < 1:
            frame = Image.blend(Image.new("RGBA", (W, H), (*BLACK, 255)), frame, fade_for(lt, dur))

    # 16.5-19.5: branded conversion card.
    else:
        lt, dur = t - 16.5, 3.0
        frame = Image.new("RGBA", (W, H), (*BLACK, 255))
        draw = ImageDraw.Draw(frame)
        draw.rectangle((0, 0, W, 10), fill=(*LIME, 255))
        draw.rectangle((0, H - 10, W, H), fill=(*LIME, 255))
        logo_size = 310
        logo_scaled = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        logo_alpha = ease_out(lt / 0.35)
        if logo_alpha < 1:
            la = logo_scaled.getchannel("A").point(lambda p: int(p * logo_alpha))
            logo_scaled.putalpha(la)
        frame.alpha_composite(logo_scaled, ((W - logo_size) // 2, 95))
        centered_text(frame, "RABBIT'S FOOT", 430, font(FONT_IMPACT, 82), fill=WHITE, stroke_width=0, alpha=ease_out((lt - 0.15) / 0.30))
        centered_text(frame, "HANDYMAN SERVICES LLC", 525, font(FONT_BOLD, 31), fill=LIME, stroke_width=0, alpha=ease_out((lt - 0.28) / 0.30), tracking=1)
        centered_text(frame, "Small Fixes. Big Difference.", 610, font(FONT_BOLD, 35), fill=WHITE, stroke_width=0, alpha=ease_out((lt - 0.40) / 0.30))
        draw.rounded_rectangle((68, 730, W - 68, 985), radius=28, outline=(*LIME, 255), width=4, fill=(15, 18, 21, 255))
        centered_text(frame, "CALL OR TEXT", 762, font(FONT_BOLD, 27), fill=GRAY, stroke_width=0, alpha=ease_out((lt - 0.65) / 0.30), tracking=2)
        centered_text(frame, "(574) 334-8410", 815, font(FONT_IMPACT, 65), fill=WHITE, stroke_width=0, alpha=ease_out((lt - 0.72) / 0.30))
        centered_text(frame, "CALLRABBITSFOOT.COM", 910, font(FONT_BOLD, 31), fill=LIME, stroke_width=0, alpha=ease_out((lt - 0.85) / 0.30), tracking=1)
        centered_text(frame, "FOLLOW FOR REAL REPAIRS", 1060, font(FONT_BOLD, 31), fill=WHITE, stroke_width=0, alpha=ease_out((lt - 1.10) / 0.30), tracking=1)

    progress_bar(frame, t)
    return frame.convert("RGB")


def make_audio(path: Path) -> None:
    # Original, royalty-free percussive bed: soft kick, click, and transition sweeps.
    rate = 44100
    samples = int(DURATION * rate)
    data = [0.0] * samples

    def add_tone(start: float, length: float, frequency: float, volume: float, decay: float = 5.0) -> None:
        begin = max(0, int(start * rate))
        end = min(samples, begin + int(length * rate))
        for i in range(begin, end):
            x = (i - begin) / rate
            envelope = math.exp(-decay * x)
            data[i] += volume * envelope * math.sin(2 * math.pi * frequency * x)

    def add_whoosh(start: float, length: float = 0.32, volume: float = 0.11) -> None:
        begin = max(0, int(start * rate))
        end = min(samples, begin + int(length * rate))
        seed = 0x12345
        for i in range(begin, end):
            x = (i - begin) / max(1, end - begin)
            seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
            noise = (seed / 0x7FFFFFFF) * 2 - 1
            envelope = math.sin(math.pi * x) ** 2
            data[i] += volume * envelope * noise

    # 120 BPM, restrained to leave room for platform voice/music overlays.
    beat = 0.5
    position = 0.0
    while position < DURATION:
        add_tone(position, 0.22, 68, 0.20, 10.0)
        add_tone(position + 0.25, 0.07, 900, 0.035, 35.0)
        position += beat

    for moment in (2.2, 4.3, 5.3, 8.2, 11.2, 14.2, 16.5):
        add_whoosh(moment - 0.16)
        add_tone(moment, 0.36, 52, 0.25, 8.0)

    # Gentle limiter and fade-out.
    pcm = bytearray()
    for i, value in enumerate(data):
        tail = clamp((samples - i) / (0.45 * rate)) if i > samples - int(0.45 * rate) else 1.0
        limited = math.tanh(value * 1.5) * 0.76 * tail
        integer = int(max(-1.0, min(1.0, limited)) * 32767)
        pcm.extend(integer.to_bytes(2, byteorder="little", signed=True))

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(bytes(pcm))


def find_ffmpeg() -> str:
    sys.path.insert(0, str(TOOLS))
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def render() -> tuple[Path, Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    silent = OUT / "rabbits-foot-shower-tile-repair-silent.mp4"
    audio = OUT / "rabbits-foot-original-audio.wav"
    final = OUT / "rabbits-foot-shower-tile-repair-viral-reel.mp4"
    cover = OUT / "rabbits-foot-shower-tile-repair-cover.jpg"

    photos = {name: load_corrected(path) for name, path in PHOTOS.items()}
    logo = Image.open(LOGO).convert("RGBA")

    command = [
        ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-vf",
        "scale=1080:1920:flags=lanczos,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        str(silent),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    frame_count = round(DURATION * FPS)
    for index in range(frame_count):
        t = index / FPS
        frame = draw_scene(t, photos, logo)
        process.stdin.write(frame.tobytes())
        if index % (FPS * 2) == 0:
            print(f"Rendered {t:4.1f}s / {DURATION:.1f}s", flush=True)
    process.stdin.close()
    code = process.wait()
    if code != 0:
        raise RuntimeError(f"Video encoder failed with exit code {code}")

    make_audio(audio)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(silent),
            "-i",
            str(audio),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(final),
        ],
        check=True,
    )

    cover_frame = draw_scene(12.35, photos, logo).resize((1080, 1920), Image.Resampling.LANCZOS)
    cover_frame.save(cover, quality=94, subsampling=0)
    print(f"FINAL={final}")
    print(f"COVER={cover}")
    return final, cover


if __name__ == "__main__":
    render()
