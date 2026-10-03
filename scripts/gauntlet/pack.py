# Builds blind critic packets: each pair of (our screen, reference screen) is shuffled into A/B.
# python3 pack.py <shotsDir> <refsDir> <outDir> <seed>   -> outDir/<part>/pairN-A.png, pairN-B.png, key.json kept in outDir/../keys
import json, os, random, shutil, sys
shots, refs, out, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
PAIRS = {
    'today': [('today-light', 'crop-tasks-1'), ('today-light', 'crop-calendar-1'), ('today-dark', 'crop-calendar-6')],
    'block': [('block-detail', 'crop-tasks-2'), ('blocks-list', 'crop-keep-1')],
    'capture': [('capture-empty', 'crop-bard-8'), ('capture-proposals', 'crop-tasks-1')],
    'review': [('review-1', 'crop-bard-6'), ('review-4', 'crop-bard-6')],
}
rng = random.Random(seed)
keys = {}
for part, pairs in PAIRS.items():
    d = os.path.join(out, part); os.makedirs(d, exist_ok=True)
    keys[part] = []
    for i, (ours, ref) in enumerate(pairs, 1):
        ours_is_a = rng.random() < 0.5
        a, b = (ours, ref) if ours_is_a else (ref, ours)
        shutil.copy(os.path.join(shots if a == ours else refs, a + '.png'), os.path.join(d, f'pair{i}-A.png'))
        shutil.copy(os.path.join(shots if b == ours else refs, b + '.png'), os.path.join(d, f'pair{i}-B.png'))
        keys[part].append({'pair': i, 'ours': 'A' if ours_is_a else 'B', 'screen': ours, 'reference': ref})
os.makedirs(out + '-keys', exist_ok=True)
json.dump(keys, open(os.path.join(out + '-keys', 'keys.json'), 'w'), indent=1)
