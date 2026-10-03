# Blind critic packets for interaction flows: the same job recorded on two builds, shuffled into A and B.
# python3 pack-flows.py <dirX> <dirY> <outDir> <seed> flow…
#   -> outDir/<flow>/{A,B}-steps.png (one frame per step), {A,B}-motion-NN.png (slowed frames of each moving step),
#      outDir/<flow>/metrics.json (taps, surfaces, elements thrown away, motion log for A and B)
#   The key (which of A/B is dirX) goes to outDir-keys/keys.json, never into the packet.
import json, os, random, sys
from PIL import Image, ImageDraw

x, y, out, seed, flows = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5:]
rng = random.Random(seed)
W, H = 206, 458

def row(files, labels, path):
    files = files[:12]
    s = Image.new('RGB', (W * max(1, len(files)), H + 22), 'white'); d = ImageDraw.Draw(s)
    for i, (f, label) in enumerate(zip(files, labels)):
        im = Image.open(f).convert('RGB'); im.thumbnail((W, H)); s.paste(im, (i * W, 22)); d.text((i * W + 3, 5), label[:34], fill='black')
    s.save(path)

def strip_record(record):
    keep = ('job', 'taps', 'typed', 'keys', 'surfaces', 'result', 'problems')
    out = {k: record.get(k) for k in keep}
    out['steps'] = [{'label': s['label'], 'kind': s['kind'], 'surface': s['where'], 'elementsRemoved': s.get('elementsRemoved'),
                     'motion': [{k: m.get(k) for k in ('kind', 'target', 'props', 'duration', 'easing', 'name')} for m in s.get('motion', [])][:14]}
                    for s in record['steps']]
    return out

keys = {}
for flow in flows:
    d = os.path.join(out, flow); os.makedirs(d, exist_ok=True)
    x_is_a = rng.random() < 0.5
    keys[flow] = 'A' if x_is_a else 'B'
    metrics = {}
    for letter, src in (('A', x if x_is_a else y), ('B', y if x_is_a else x)):
        record = json.load(open(os.path.join(src, flow + '.json')))
        base = os.path.join(src, flow)
        steps = [s for s in record['steps']]
        row([os.path.join(base, s['file']) for s in steps], [f"{i}. {s['label']}" for i, s in enumerate(steps)], os.path.join(d, f'{letter}-steps.png'))
        for i, s in enumerate(steps):
            frames = s.get('motionFrames') or []
            if len(frames) >= 3:
                row([os.path.join(base, f) for f in frames], [f"step {i} {s['label'][:14]} {f.split('-')[-1][:-4]}" for f in frames],
                    os.path.join(d, f'{letter}-motion-{i:02d}.png'))
        metrics[letter] = strip_record(record)
    json.dump(metrics, open(os.path.join(d, 'metrics.json'), 'w'), indent=1)
os.makedirs(out + '-keys', exist_ok=True)
json.dump(keys, open(os.path.join(out + '-keys', 'keys.json'), 'w'), indent=1)
print(json.dumps({'packed': flows}))
