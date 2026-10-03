# Contact sheet: python3 sheet.py out.png a.png b.png ...  (each scaled to 300px wide, 6 per row)
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
w, h, cols = 300, 666, 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, (h + 24) * rows), 'white')
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB'); im.thumbnail((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    sheet.paste(im, (x, y + 24)); d.text((x + 4, y + 6), f.split('/')[-1], fill='black')
sheet.save(out)
