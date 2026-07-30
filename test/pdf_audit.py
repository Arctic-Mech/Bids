#!/usr/bin/env python3
"""Audit a PDF for colliding text spans and text running outside the page box.
Usage: pdf_audit.py file.pdf [--verbose]"""
import sys
import fitz

path = sys.argv[1]
verbose = '--verbose' in sys.argv
doc = fitz.open(path)

def spans(page):
    out = []
    for blk in page.get_text('dict')['blocks']:
        if blk.get('type') != 0:
            continue
        for line in blk['lines']:
            for sp in line['spans']:
                t = sp['text']
                if t.strip() == '':
                    continue
                out.append((fitz.Rect(sp['bbox']), t, round(sp['size'], 1)))
    return out

def inter_frac(a, b):
    r = a & b
    if r.is_empty:
        return 0.0
    small = min(a.get_area(), b.get_area())
    return r.get_area() / small if small else 0.0

total_coll = total_out = 0
for pno, page in enumerate(doc):
    sp = spans(page)
    pr = page.rect
    # margin box: flag text starting/ending outside the printable page
    coll = []
    for i in range(len(sp)):
        for j in range(i + 1, len(sp)):
            ra, ta, _ = sp[i]
            rb, tb, _ = sp[j]
            if abs(ra.y0 - rb.y0) > max(ra.height, rb.height) * 1.2:
                continue                     # different lines entirely
            f = inter_frac(ra, rb)
            if f > 0.18:                     # meaningful visual overlap
                coll.append((round(f, 2), ta.strip()[:34], tb.strip()[:34], [round(v) for v in ra], [round(v) for v in rb]))
    outside = [(t.strip()[:40], [round(v) for v in r]) for r, t, _ in sp
               if r.x0 < -1 or r.y0 < -1 or r.x1 > pr.width + 1 or r.y1 > pr.height + 1]
    total_coll += len(coll)
    total_out += len(outside)
    if coll or outside:
        head = [l.strip() for l in page.get_text().splitlines() if l.strip()]
        print(f"p{pno+1:02d} [{head[0][:40] if head else '?'}]  collisions={len(coll)} offpage={len(outside)}")
        for c in (coll if verbose else coll[:6]):
            print(f"     x{c[0]:<5} {c[1]!r} <> {c[2]!r}  {c[3]} / {c[4]}")
        if len(coll) > 6 and not verbose:
            print(f"     ... {len(coll)-6} more")
        for o in (outside if verbose else outside[:4]):
            print(f"     OFFPAGE {o[0]!r} at {o[1]} (page {round(pr.width)}x{round(pr.height)})")

print(f"\nTOTAL: {total_coll} colliding span pairs, {total_out} off-page spans, across {len(doc)} pages")
