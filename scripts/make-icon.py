import struct
import zlib
from pathlib import Path

w = h = 128
rows = []
for y in range(h):
    row = bytearray([0])
    for x in range(w):
        dx = (x - w / 2) / (w / 2)
        dy = (y - h / 2) / (h / 2)
        inside = dx * dx + dy * dy < 0.55
        row += bytes((90, 120, 255, 255) if inside else (18, 20, 28, 255))
    rows.append(bytes(row))
raw = b"".join(rows)

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(raw, 9))
    + chunk(b"IEND", b"")
)

out = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "icon.png"
out.write_bytes(png)
print(f"wrote {out} ({len(png)} bytes)")
