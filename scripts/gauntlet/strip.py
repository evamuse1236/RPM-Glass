# Filmstrip: python3 strip.py out.png frame1 frame2 ... (one row, 206px wide each, labelled with the file name)
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
w, h = 206, 458
s = Image.new('RGB', (w * len(files), h + 20), 'white'); d = ImageDraw.Draw(s)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB'); im.thumbnail((w, h)); s.paste(im, (i * w, 20)); d.text((i * w + 3, 4), f.split('/')[-1][:30], fill='black')
s.save(out)
