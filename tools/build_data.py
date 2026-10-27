import json, os, re, sys
sys.path.insert(0, 'tools'); from slug import slug
SEEN = set()
LEVELS = ['A1', 'A2', 'B1', 'B2']
master = json.load(open('data/master_list.json'))
total = len(master)
counts = {lv: sum(1 for o in master if o['level'] == lv) for lv in LEVELS}
def toks(fa): return [t.strip() for t in re.split(r'[،؛,]', re.sub(r'\(.*?\)', '', fa)) if t.strip()]
def clash(a, b): ta, tb = toks(a[1]), toks(b[1]); return a[1] == b[1] or any(t in tb for t in ta) or a[0].lower() == b[0].lower()
index = {'version': int(os.environ.get('DATAV', '1')), 'total': total, 'levels': []}
report = {}
for lv in LEVELS:
    path = f'data/content_{lv}.txt'
    avail = os.path.exists(path) and lv in os.environ.get('LEVELS', 'A1 A2 B1 B2').split()
    index['levels'].append({'id': lv, 'count': counts[lv], 'available': avail})
    if not avail: continue
    rows = [l.rstrip('\n').split('|') for l in open(path) if l.strip()]
    rows = [[w.replace('’', "'"), fa, ex] for w, fa, ex in rows]
    lessons = [rows[i:i + 10] for i in range(0, len(rows), 10)]
    if len(lessons) > 1 and len(lessons[-1]) < 5:  # merge a tiny remainder
        last = lessons.pop(); lessons[-1] = lessons[-1] + last
    swaps = 0
    for li in range(len(lessons)):
        if lv == 'A1' and li == 0: continue
        L = lessons[li]
        for k in range(len(L)):
            if any(clash(L[k], L[j]) for j in range(len(L)) if j != k):
                done = False
                for lj in range(li + 1, len(lessons)):
                    for m, cand in enumerate(lessons[lj]):
                        if not any(clash(cand, L[j]) for j in range(len(L)) if j != k):
                            L[k], lessons[lj][m] = cand, L[k]; swaps += 1; done = True; break
                    if done: break
    bad = sum(1 for L in lessons for a in range(len(L)) for b in range(a + 1, len(L)) if clash(L[a], L[b]))
    out = []
    nimg = 0
    for L in lessons:
        ls = []
        for w, fa, ex in L:
            i = slug(w); assert i not in SEEN, ('dup id', i); SEEN.add(i); img = 1 if os.path.exists(f'site/img/{i}.webp') else 0; nimg += img
            for f in (f'site/audio/{i}.mp3', f'site/audio/{i}-ex.mp3'):
                assert os.path.exists(f), f
            ls.append([i, w, fa, ex, img])
        out.append(ls)
    json.dump({'level': lv, 'lessons': out}, open(f'site/data/{lv}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    report[lv] = dict(words=len(rows), lessons=len(out), last=len(out[-1]), swaps=swaps, clashes_left=bad, images=nimg)
json.dump(index, open('site/data/index.json', 'w'), ensure_ascii=False)
print(json.dumps(report))
