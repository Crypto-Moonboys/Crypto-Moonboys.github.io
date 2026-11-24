#!/usr/bin/env python3
"""Generate the NBG London Level 1 backdrop art (sky + six skyline scenes).

Everything is drawn as hard-edged pixel art on a 2x-detail grid (960x320 per
480x160 game panel) and exported with nearest-neighbour scaling, so the PNGs
stay sharp at the game's 2x backing canvas and 1.25x/1.5x camera zoom.

The six scenes are cut from ONE continuous panorama whose features wrap
around, so every panel joins its neighbour seamlessly, including the loop
from the last scene back to the first.

Usage:  python3 scripts/art/generate-nbg-london-backdrops.py [out_dir]
Default out_dir: game/assets/world/london
Deterministic: same script -> same pixels.
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw

GRID = 2            # detail grid relative to the 480x160 logical panel
EXPORT = 2          # nearest-neighbour export scale (final = 4x logical)
PW, PH = 480 * GRID, 160 * GRID          # one panel on the detail grid
SCENES = [
    'westminster', 'tower-bridge', 'the-city',
    'canary-wharf', 'greenwich', 'camden-shoreditch',
]
TW = PW * len(SCENES)                    # panorama width (wraps)
GROUND = 232                             # embankment top (detail grid)
RIVER_TOP = 246

# ── palette ────────────────────────────────────────────────────────────────
C = dict(
    haze1='#b7d9f6', haze1w='#cbe5fa',
    haze2='#8fbdea', haze2w='#a9cff2', haze2d='#7aaee2',
    glass='#3d7fd3', glassL='#6eaaf0', glassD='#28589f', glassW='#9fd0fa', glassX='#1d4380',
    glassT='#2f9fb8', glassTL='#5cc7da', glassTD='#1f6f84',
    brick='#b8643a', brickL='#d88a58', brickD='#87452a', brickX='#5e2e1c',
    stone='#e0c88e', stoneL='#f3e2b2', stoneD='#b8995f', stoneX='#86693b',
    white='#f4f4ee', whiteL='#ffffff', whiteD='#c9cfd6', whiteX='#98a3ae',
    roof='#4d5a6e', roofL='#6c7b91', roofD='#323c4c',
    lead='#7f8f9a', leadL='#a9b8c2', leadD='#58646d',
    gold='#f2c14e', goldD='#b8862a',
    win='#f6e7b6', winD='#4a5c7d', winB='#2a3550',
    tree='#3c9a3c', treeL='#69c94f', treeD='#236b2c', treeX='#174d22', trunk='#5c3b22',
    emb='#9b978d', embL='#c2beb2', embD='#6f6b63', embX='#55524c',
    river='#2f86e4', riverL='#5eaaf2', riverH='#a6d6ff', riverD='#1f65bf', riverX='#174f9c',
    red='#d8343a', redD='#9c2027', green='#3f9a63', greenD='#2a6e45', greenL='#62c184',
    blue='#2d6fd1', black='#20232b', yellow='#f5d33a',
    eye='#e8eef5', eyeD='#a7b6c6',
    grass='#5fb84a', grassD='#3f8f35',
    pink='#ff4fa8', cyan='#38e0e8', purple='#8c5cff', orange='#ff9a2e', lime='#b6f03a',
)


class Pano:
    """Wrap-around panorama drawing surface."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def _offsets(self):
        return (-self.w, 0, self.w)

    def rect(self, x0, y0, x1, y1, fill):
        if x1 < x0 or y1 < y0:
            return
        for o in self._offsets():
            self.d.rectangle([x0 + o, y0, x1 + o, y1], fill=fill)

    def poly(self, pts, fill):
        for o in self._offsets():
            self.d.polygon([(x + o, y) for x, y in pts], fill=fill)

    def ellipse(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        for o in self._offsets():
            self.d.ellipse([x0 + o, y0, x1 + o, y1], fill=fill, outline=outline, width=width)

    def line(self, pts, fill, width=1):
        for o in self._offsets():
            self.d.line([(x + o, y) for x, y in pts], fill=fill, width=width)

    def px(self, x, y, fill):
        self.rect(x, y, x, y, fill)


# ── generic building helpers ──────────────────────────────────────────────

def windows(p, x0, y0, x1, y1, col, dark, step_x=4, step_y=5, ww=2, wh=2, rnd=None, lit=0.55):
    rnd = rnd or random.Random(x0 * 31 + y0)
    for y in range(y0, y1 - wh + 1, step_y):
        for x in range(x0, x1 - ww + 1, step_x):
            p.rect(x, y, x + ww - 1, y + wh - 1, col if rnd.random() < lit else dark)


def box(p, x, top, w, base, body, light, dark, outline=None):
    p.rect(x, top, x + w - 1, base, body)
    p.rect(x, top, x + 1, base, light)
    p.rect(x + w - 2, top, x + w - 1, base, dark)
    if outline:
        p.rect(x, top, x + w - 1, top, outline)


def glass_tower(p, x, w, h, base=GROUND, tint='glass', crown=None, rnd=None):
    rnd = rnd or random.Random(x * 7 + h)
    top = base - h
    body, L, D = C[tint], C[tint + 'L'], C[tint + 'D']
    box(p, x, top, w, base, body, L, D)
    # vertical mullions and floor bands
    for mx in range(x + 4, x + w - 3, 5):
        p.rect(mx, top + 3, mx, base, D)
    for fy in range(top + 4, base, 6):
        p.rect(x + 2, fy, x + w - 3, fy, C['glassW'] if rnd.random() < 0.6 else L)
    # sky reflection: a soft light band down the left third
    p.rect(x + 3, top + 3, x + 3 + max(1, w // 6), base, L)
    p.rect(x, top, x + w - 1, top + 1, C['glassX'])
    if crown == 'antenna':
        p.rect(x + w // 2, top - 14, x + w // 2, top, C['whiteX'])
        p.px(x + w // 2, top - 15, C['red'])
    elif crown == 'step':
        p.rect(x + 2, top - 4, x + w - 3, top - 1, D)
        p.rect(x + 5, top - 8, x + w - 6, top - 5, body)
    elif crown == 'slant':
        p.poly([(x, top), (x + w - 1, top - w // 2), (x + w - 1, top)], body)
        p.line([(x, top), (x + w - 1, top - w // 2)], L)


def brick_block(p, x, w, h, base=GROUND, rnd=None, roof=True, chimneys=True, kind='brick'):
    rnd = rnd or random.Random(x * 13 + w)
    top = base - h
    body, L, D, X = C[kind], C[kind + 'L'], C[kind + 'D'], C[kind + 'X']
    box(p, x, top, w, base, body, L, D)
    # brick texture rows
    for y in range(top + 2, base, 3):
        off = 0 if (y // 3) % 2 else 2
        for bx in range(x + 2 + off, x + w - 2, 5):
            p.px(bx, y, D)
    # sash windows with white frames
    for y in range(top + 5, base - 6, 9):
        for wx in range(x + 4, x + w - 6, 7):
            p.rect(wx - 1, y - 1, wx + 3, y + 5, C['white'])
            p.rect(wx, y, wx + 2, y + 4, C['win'] if rnd.random() < 0.35 else C['winD'])
            p.rect(wx, y + 2, wx + 2, y + 2, C['white'])
    p.rect(x - 1, top - 1, x + w, top, X)
    if roof:
        p.poly([(x - 1, top - 1), (x + 4, top - 7), (x + w - 5, top - 7), (x + w, top - 1)], C['roof'])
        p.rect(x + 4, top - 7, x + w - 5, top - 7, C['roofL'])
    if chimneys:
        for cx in range(x + 5, x + w - 6, max(10, w // 3)):
            p.rect(cx, top - 13, cx + 3, top - 5, D)
            p.rect(cx - 1, top - 14, cx + 4, top - 13, X)
            p.rect(cx, top - 16, cx + 1, top - 15, C['orange'])
            p.rect(cx + 2, top - 16, cx + 3, top - 15, C['brickL'])


def tree(p, x, y, r, rnd):
    p.rect(x - 1, y, x + 1, y + r + 2, C['trunk'])
    for _ in range(5):
        dx, dy = rnd.randint(-r, r), rnd.randint(-r, 0)
        rr = rnd.randint(max(3, r - 2), r + 1)
        p.ellipse(x + dx - rr, y + dy - rr, x + dx + rr, y + dy + rr, fill=C['treeD'])
    for _ in range(4):
        dx, dy = rnd.randint(-r + 1, r - 1), rnd.randint(-r, -1)
        rr = rnd.randint(max(2, r - 3), r)
        p.ellipse(x + dx - rr, y + dy - rr - 1, x + dx + rr, y + dy + rr - 1, fill=C['tree'])
    for _ in range(3):
        dx, dy = rnd.randint(-r + 2, 1), rnd.randint(-r, -2)
        p.ellipse(x + dx - 2, y + dy - 3, x + dx + 2, y + dy, fill=C['treeL'])


def lamp(p, x, base=GROUND):
    p.rect(x, base - 16, x, base, C['black'])
    p.rect(x - 2, base - 19, x + 2, base - 17, C['black'])
    p.rect(x - 1, base - 18, x + 1, base - 17, C['yellow'])


# ── shared layers: haze skylines, embankment, river ───────────────────────

def haze_layers(p):
    rnd = random.Random(1201)
    # far layer: pale silhouettes, continuous and wrapping
    x = 0
    while x < TW:
        w = rnd.randint(10, 26)
        h = rnd.randint(40, 120)
        top = GROUND - h
        p.rect(x, top, x + w - 1, GROUND, C['haze1'])
        for y in range(top + 4, GROUND, 6):
            for wx in range(x + 2, x + w - 2, 4):
                if rnd.random() < 0.5:
                    p.px(wx, y, C['haze1w'])
        if rnd.random() < 0.2:
            p.rect(x + w // 2, top - 8, x + w // 2, top, C['haze1'])
        x += w + rnd.randint(-4, 3)
    # nearer haze layer
    x = 0
    rnd = random.Random(2207)
    while x < TW:
        w = rnd.randint(12, 30)
        h = rnd.randint(28, 90)
        top = GROUND - h
        p.rect(x, top, x + w - 1, GROUND, C['haze2'])
        p.rect(x, top, x + 1, GROUND, C['haze2w'])
        p.rect(x + w - 2, top, x + w - 1, GROUND, C['haze2d'])
        for y in range(top + 4, GROUND, 5):
            for wx in range(x + 3, x + w - 3, 4):
                if rnd.random() < 0.45:
                    p.rect(wx, y, wx + 1, y + 1, C['haze2w'])
        x += w + rnd.randint(6, 30)


def embankment_and_river(p):
    # river
    p.rect(0, RIVER_TOP, TW - 1, PH - 1, C['river'])
    rnd = random.Random(77)
    for y in range(RIVER_TOP + 3, PH, 4):
        for _ in range(TW // 40):
            x = rnd.randrange(0, TW)
            ln = rnd.randint(4, 16)
            col = C['riverL'] if rnd.random() < 0.7 else C['riverH']
            p.rect(x, y, x + ln, y, col)
    for y in range(PH - 24, PH, 3):
        for _ in range(TW // 60):
            x = rnd.randrange(0, TW)
            p.rect(x, y, x + rnd.randint(6, 20), y, C['riverD'])
    # embankment wall with granite blocks and a coping stone
    p.rect(0, GROUND, TW - 1, RIVER_TOP - 1, C['emb'])
    p.rect(0, GROUND, TW - 1, GROUND + 1, C['embL'])
    p.rect(0, RIVER_TOP - 2, TW - 1, RIVER_TOP - 1, C['embD'])
    for y in range(GROUND + 5, RIVER_TOP - 2, 4):
        off = 0 if (y // 4) % 2 else 6
        for x in range(off, TW, 12):
            p.rect(x, y - 3, x, y, C['embD'])
        p.rect(0, y, TW - 1, y, C['embD'])
    # waterline shadow
    p.rect(0, RIVER_TOP, TW - 1, RIVER_TOP + 1, C['riverX'])
    # Victorian lamp posts every 48px along the whole embankment
    for x in range(20, TW, 48):
        lamp(p, x)


def tree_row(p, x0, x1, seed, y=GROUND - 2):
    rnd = random.Random(seed)
    x = x0
    while x < x1:
        tree(p, x, y - rnd.randint(4, 8), rnd.randint(5, 8), rnd)
        x += rnd.randint(9, 16)


def reflection(p, x0, x1, col):
    rnd = random.Random(x0)
    for y in range(RIVER_TOP + 3, RIVER_TOP + 30, 3):
        span = int((x1 - x0) * (1 - (y - RIVER_TOP) / 34))
        cx = (x0 + x1) // 2 + rnd.randint(-3, 3)
        if span > 2:
            p.rect(cx - span // 2, y, cx + span // 2, y, col)


# ── scene 1: Westminster ──────────────────────────────────────────────────

def arch(p, x0, x1, spring_y, rise, col):
    pts = []
    for i in range(0, 25):
        t = i / 24
        pts.append((x0 + (x1 - x0) * t, spring_y + rise - rise * math.sin(math.pi * t)))
    p.line(pts, col, 3)
    p.line([(x, y + 3) for x, y in pts], C['green'], 1)


def gothic_pinnacles(p, x0, x1, top, step, h, col):
    for x in range(x0, x1 + 1, step):
        p.rect(x, top - h, x + 1, top, col)
        p.px(x, top - h - 1, col)


def gothic_windows(p, x0, x1, y0, y1, step=6):
    for x in range(x0, x1 - 2, step):
        for y in range(y0, y1 - 6, 11):
            p.rect(x, y + 1, x + 2, y + 7, C['winB'])
            p.px(x + 1, y, C['winB'])
            p.rect(x, y + 4, x + 2, y + 4, C['stoneD'])


def scene_westminster(p, ox):
    rnd = random.Random(11)
    # Westminster Bridge (green arches) on the left
    deck = GROUND - 6
    p.rect(ox + 10, deck, ox + 270, deck + 5, C['green'])
    p.rect(ox + 10, deck, ox + 270, deck, C['greenL'])
    p.rect(ox + 10, deck - 4, ox + 270, deck - 1, C['greenD'])
    for x in range(ox + 12, ox + 270, 4):
        p.rect(x, deck - 4, x, deck - 1, C['green'])
    for ax in range(ox + 10, ox + 270, 52):
        p.rect(ax, deck + 5, ax + 8, PH - 40, C['stone'])
        p.rect(ax, deck + 5, ax + 1, PH - 40, C['stoneL'])
        if ax + 52 <= ox + 270:
            arch(p, ax + 9, ax + 51, deck + 5, 16, C['greenD'])
        lamp(p, ax + 4, deck - 4)
    # Palace of Westminster
    px0, px1 = ox + 300, ox + 712
    body_top = GROUND - 52
    p.rect(px0, body_top, px1, GROUND, C['stone'])
    p.rect(px0, body_top, px1, body_top + 2, C['stoneL'])
    for bx in range(px0, px1, 9):
        p.rect(bx, body_top - 4, bx + 1, GROUND, C['stoneD'])
        p.px(bx, body_top - 6, C['stoneD'])
    gothic_windows(p, px0 + 4, px1 - 4, body_top + 6, GROUND - 4)
    # lead roofs and roof pinnacles
    p.poly([(px0, body_top), (px0 + 8, body_top - 10), (px1 - 8, body_top - 10), (px1, body_top)], C['lead'])
    p.rect(px0 + 8, body_top - 10, px1 - 8, body_top - 10, C['leadL'])
    gothic_pinnacles(p, px0 + 4, px1 - 4, body_top - 10, 14, 6, C['stoneD'])
    # Central lantern tower with spire
    cx = ox + 520
    box(p, cx - 12, body_top - 46, 24, body_top, C['stone'], C['stoneL'], C['stoneD'])
    gothic_windows(p, cx - 9, cx + 10, body_top - 40, body_top - 4, 5)
    p.poly([(cx - 12, body_top - 46), (cx, body_top - 86), (cx + 12, body_top - 46)], C['lead'])
    p.line([(cx - 12, body_top - 46), (cx, body_top - 86)], C['leadL'])
    p.rect(cx, body_top - 94, cx, body_top - 86, C['goldD'])
    # Victoria Tower (left end) with flag
    vx = ox + 300
    box(p, vx, GROUND - 150, 42, GROUND, C['stone'], C['stoneL'], C['stoneD'])
    for y in range(GROUND - 144, GROUND - 6, 16):
        gothic_windows(p, vx + 6, vx + 38, y, y + 13, 7)
    for cxx in (vx, vx + 38):
        p.rect(cxx, GROUND - 166, cxx + 3, GROUND - 150, C['stoneD'])
        p.poly([(cxx, GROUND - 166), (cxx + 2, GROUND - 174), (cxx + 4, GROUND - 166)], C['goldD'])
    p.rect(vx + 4, GROUND - 156, vx + 37, GROUND - 150, C['stoneD'])
    p.rect(vx + 21, GROUND - 188, vx + 21, GROUND - 156, C['black'])
    p.rect(vx + 22, GROUND - 188, vx + 33, GROUND - 181, C['red'])
    p.rect(vx + 22, GROUND - 185, vx + 33, GROUND - 184, C['white'])
    p.rect(vx + 26, GROUND - 188, vx + 27, GROUND - 181, C['white'])
    # Elizabeth Tower (Big Ben)
    bx = ox + 724
    shaft_top = GROUND - 76
    box(p, bx, shaft_top, 30, GROUND, C['stone'], C['stoneL'], C['stoneD'])
    for y in range(shaft_top + 4, GROUND - 4, 10):
        for x in range(bx + 4, bx + 26, 5):
            p.rect(x, y, x + 1, y + 6, C['stoneD'])
    clock_top = shaft_top - 40
    box(p, bx - 3, clock_top, 36, shaft_top, C['stone'], C['stoneL'], C['stoneD'])
    p.rect(bx - 3, clock_top, bx + 32, clock_top + 1, C['goldD'])
    ccx, ccy = bx + 15, clock_top + 20
    p.ellipse(ccx - 14, ccy - 14, ccx + 14, ccy + 14, fill=C['gold'])
    p.ellipse(ccx - 12, ccy - 12, ccx + 12, ccy + 12, fill=C['white'])
    for a in range(12):
        ang = a * math.pi / 6
        p.px(round(ccx + math.cos(ang) * 10), round(ccy + math.sin(ang) * 10), C['black'])
    p.line([(ccx, ccy), (ccx, ccy - 8)], C['black'])
    p.line([(ccx, ccy), (ccx + 6, ccy + 2)], C['black'])
    # belfry and gilded spire
    belfry = clock_top - 18
    box(p, bx, belfry, 30, clock_top, C['stone'], C['stoneL'], C['stoneD'])
    for x in range(bx + 4, bx + 26, 6):
        p.rect(x, belfry + 4, x + 3, clock_top - 3, C['winB'])
    p.poly([(bx - 2, belfry), (bx + 15, belfry - 58), (bx + 32, belfry)], C['lead'])
    p.poly([(bx + 15, belfry - 58), (bx + 32, belfry), (bx + 21, belfry)], C['leadD'])
    for y in range(belfry - 50, belfry - 2, 7):
        half = (y - (belfry - 58)) * 17 // 58
        p.rect(bx + 15 - half + 2, y, bx + 15 + half - 2, y, C['gold'])
    p.rect(bx + 15, belfry - 72, bx + 15, belfry - 58, C['goldD'])
    p.rect(bx + 14, belfry - 68, bx + 16, belfry - 68, C['gold'])
    p.px(bx + 15, belfry - 73, C['gold'])
    for cxx in (bx - 3, bx + 30):
        p.rect(cxx, belfry - 8, cxx + 2, belfry, C['stoneD'])
    # London Eye
    ex, ey, er = ox + 868, GROUND - 82, 74
    p.ellipse(ex - er, ey - er, ex + er, ey + er, outline=C['eye'], width=3)
    p.ellipse(ex - er + 8, ey - er + 8, ex + er - 8, ey + er - 8, outline=C['eyeD'], width=1)
    for a in range(32):
        ang = a * math.pi / 16
        p.line([(ex, ey), (ex + math.cos(ang) * (er - 2), ey + math.sin(ang) * (er - 2))], C['eyeD'])
    for a in range(32):
        ang = a * math.pi / 16 + 0.05
        cxp, cyp = ex + math.cos(ang) * (er + 2), ey + math.sin(ang) * (er + 2)
        p.ellipse(cxp - 3, cyp - 2, cxp + 3, cyp + 3, fill=C['white'], outline=C['whiteX'])
    p.ellipse(ex - 5, ey - 5, ex + 5, ey + 5, fill=C['whiteD'])
    p.line([(ex, ey), (ex - 34, GROUND)], C['whiteD'], 3)
    p.line([(ex, ey), (ex - 18, GROUND)], C['whiteD'], 3)
    # County Hall (brick, right)
    brick_block(p, ox + 780, 56, 40, rnd=rnd, chimneys=False)
    tree_row(p, ox + 286, ox + 300, 5)
    tree_row(p, ox + 762, ox + 790, 6)
    reflection(p, ox + 724, ox + 754, C['riverH'])
    reflection(p, ox + 300, ox + 712, C['riverL'])


# ── scene 2: Tower of London + Tower Bridge ──────────────────────────────

def crenellate(p, x0, x1, y, col, step=4):
    for x in range(x0, x1, step * 2):
        p.rect(x, y - 3, x + step - 1, y - 1, col)


def bridge_tower(p, x, w, top, base):
    box(p, x, top, w, base, C['stone'], C['stoneL'], C['stoneD'])
    for y in range(top + 8, base - 8, 18):
        gothic_windows(p, x + 6, x + w - 6, y, y + 14, 8)
    # corner turrets
    for cx in (x - 2, x + w - 4):
        p.rect(cx, top - 14, cx + 5, base, C['stoneD'])
        p.rect(cx + 1, top - 14, cx + 2, base, C['stone'])
        p.poly([(cx - 1, top - 14), (cx + 3, top - 26), (cx + 7, top - 14)], C['lead'])
        p.rect(cx + 3, top - 30, cx + 3, top - 26, C['goldD'])
    # central pyramid roof
    p.poly([(x + 2, top), (x + w // 2, top - 34), (x + w - 3, top)], C['lead'])
    p.poly([(x + w // 2, top - 34), (x + w - 3, top), (x + w // 2 + 4, top)], C['leadD'])
    p.rect(x + w // 2, top - 42, x + w // 2, top - 34, C['goldD'])
    p.px(x + w // 2, top - 43, C['gold'])


def scene_tower_bridge(p, ox):
    rnd = random.Random(22)
    # background City towers glimpsed behind
    for i, (x, w, h, crown) in enumerate([(40, 26, 120, 'antenna'), (200, 22, 96, 'step'),
                                          (330, 30, 140, None), (690, 24, 110, 'slant'), (880, 28, 128, 'step')]):
        glass_tower(p, ox + x, w, h, crown=crown, rnd=random.Random(i + 40))
    # Tower of London: curtain wall + White Tower keep
    wall_top = GROUND - 26
    p.rect(ox + 20, wall_top, ox + 250, GROUND, C['stone'])
    p.rect(ox + 20, wall_top, ox + 250, wall_top + 1, C['stoneL'])
    crenellate(p, ox + 20, ox + 250, wall_top, C['stone'])
    for tx in (ox + 20, ox + 130, ox + 240):
        box(p, tx - 6, wall_top - 12, 18, GROUND, C['stone'], C['stoneL'], C['stoneD'])
        crenellate(p, tx - 6, tx + 12, wall_top - 12, C['stone'], 3)
        p.rect(tx + 1, wall_top - 4, tx + 4, wall_top + 4, C['winB'])
    kx, kw, ktop = ox + 70, 96, GROUND - 92
    box(p, kx, ktop, kw, wall_top, C['white'], C['eye'], C['whiteD'])
    for y in range(ktop + 10, wall_top - 8, 16):
        for x in range(kx + 10, kx + kw - 10, 14):
            p.rect(x, y, x + 3, y + 8, C['winB'])
            p.px(x + 1, y - 1, C['winB'])
            p.px(x + 2, y - 1, C['winB'])
    crenellate(p, kx, kx + kw, ktop, C['white'], 3)
    for i, tx in enumerate((kx - 4, kx + kw - 10)):
        box(p, tx, ktop - 14, 14, ktop + 10, C['white'], C['eye'], C['whiteD'])
        p.ellipse(tx - 1, ktop - 26, tx + 14, ktop - 10, fill=C['lead'])
        p.ellipse(tx + 1, ktop - 25, tx + 6, ktop - 18, fill=C['leadL'])
        p.rect(tx + 6, ktop - 34, tx + 6, ktop - 26, C['goldD'])
    p.rect(kx + 46, ktop - 30, kx + 46, ktop - 4, C['black'])
    p.rect(kx + 47, ktop - 30, kx + 60, ktop - 22, C['red'])
    p.rect(kx + 47, ktop - 27, kx + 60, ktop - 25, C['white'])
    p.rect(kx + 52, ktop - 30, kx + 54, ktop - 22, C['white'])
    tree_row(p, ox + 254, ox + 300, 23)
    # Tower Bridge
    t1, t2, tw = ox + 420, ox + 610, 46
    ttop = GROUND - 150
    deck = GROUND - 8
    # suspension chains to the shore
    for side, (sx, ex_) in enumerate([(ox + 300, t1), (t2 + tw, ox + 760)]):
        for k in range(0, 2):
            pts = []
            for i in range(0, 41):
                t = i / 40
                xx = sx + (ex_ - sx) * t
                if side == 0:
                    yy = deck - 4 - (ttop + 30 - (deck - 4)) * -(t ** 2) - k * 3
                    yy = deck - 4 - ((deck - 4) - (ttop + 34)) * (t ** 2) - k * 3
                else:
                    yy = deck - 4 - ((deck - 4) - (ttop + 34)) * ((1 - t) ** 2) - k * 3
                pts.append((xx, yy))
            p.line(pts, C['blue'] if k == 0 else C['glassW'], 2 if k == 0 else 1)
        for i in range(1, 12):
            xx = sx + (ex_ - sx) * i / 12
            t = i / 12
            yy = deck - 4 - ((deck - 4) - (ttop + 34)) * ((t ** 2) if side == 0 else ((1 - t) ** 2))
            p.line([(xx, yy), (xx, deck)], C['blue'])
    # deck + bascules
    p.rect(ox + 300, deck, ox + 760, deck + 5, C['blue'])
    p.rect(ox + 300, deck, ox + 760, deck, C['glassW'])
    p.rect(ox + 300, deck + 6, ox + 760, deck + 7, C['glassX'])
    # piers into river
    for tx in (t1, t2):
        p.rect(tx - 6, deck + 6, tx + tw + 5, PH - 30, C['stoneD'])
        p.rect(tx - 6, deck + 6, tx - 3, PH - 30, C['stone'])
    # high-level walkways
    for wy in (ttop + 12, ttop + 22):
        p.rect(t1 + tw, wy, t2 - 1, wy + 6, C['blue'])
        for x in range(t1 + tw, t2, 6):
            p.line([(x, wy), (x + 6, wy + 6)], C['glassW'])
        p.rect(t1 + tw, wy, t2 - 1, wy, C['glassW'])
    bridge_tower(p, t1, tw, ttop, deck + 6)
    bridge_tower(p, t2, tw, ttop, deck + 6)
    reflection(p, t1, t1 + tw, C['riverH'])
    reflection(p, t2, t2 + tw, C['riverH'])
    # HMS Belfast moored on the right
    hx = ox + 800
    hull_y = RIVER_TOP + 4
    p.poly([(hx, hull_y - 10), (hx + 140, hull_y - 10), (hx + 128, hull_y + 6), (hx + 8, hull_y + 6)], C['whiteX'])
    p.rect(hx + 4, hull_y - 10, hx + 136, hull_y - 9, C['eye'])
    p.rect(hx + 8, hull_y + 2, hx + 128, hull_y + 6, C['black'])
    p.rect(hx + 40, hull_y - 26, hx + 96, hull_y - 10, C['whiteD'])
    p.rect(hx + 52, hull_y - 38, hx + 80, hull_y - 26, C['whiteD'])
    p.rect(hx + 58, hull_y - 60, hx + 60, hull_y - 38, C['black'])
    p.rect(hx + 84, hull_y - 50, hx + 86, hull_y - 26, C['black'])
    for gx in (hx + 14, hx + 110):
        p.rect(gx, hull_y - 16, gx + 14, hull_y - 10, C['whiteX'])
        p.rect(gx + 14, hull_y - 14, gx + 24, hull_y - 13, C['black'])
    for wx in range(hx + 44, hx + 92, 6):
        p.rect(wx, hull_y - 22, wx + 2, hull_y - 20, C['winB'])


# ── scene 3: The City ─────────────────────────────────────────────────────

def scene_the_city(p, ox):
    rnd = random.Random(33)
    for i, (x, w, h, crown) in enumerate([(300, 22, 100, 'step'), (690, 24, 118, 'antenna'), (900, 26, 96, None)]):
        glass_tower(p, ox + x, w, h, crown=crown, rnd=random.Random(i + 300))
    # Tower 42 (grey, square)
    box(p, ox + 345, GROUND - 126, 30, GROUND, C['lead'], C['leadL'], C['leadD'])
    windows(p, ox + 349, GROUND - 120, ox + 372, GROUND - 4, C['glassW'], C['leadD'], 4, 4, 2, 2)
    # St Paul's Cathedral
    sx = ox + 60
    base_top = GROUND - 44
    box(p, sx, base_top, 200, GROUND, C['white'], C['eye'], C['whiteD'])
    for x in range(sx + 6, sx + 196, 8):
        p.rect(x, base_top + 6, x + 3, GROUND - 6, C['whiteD'])
        p.rect(x + 1, base_top + 10, x + 2, base_top + 18, C['winB'])
    p.rect(sx, base_top, sx + 199, base_top + 2, C['whiteX'])
    # west front towers
    for tx in (sx + 4, sx + 168):
        box(p, tx, base_top - 40, 28, base_top, C['white'], C['eye'], C['whiteD'])
        for y in (base_top - 34, base_top - 20):
            p.rect(tx + 10, y, tx + 17, y + 9, C['winB'])
        p.ellipse(tx + 4, base_top - 56, tx + 24, base_top - 36, fill=C['white'])
        p.rect(tx + 13, base_top - 66, tx + 14, base_top - 54, C['goldD'])
    # drum, colonnade and dome
    dcx = sx + 100
    box(p, dcx - 44, base_top - 30, 88, base_top, C['white'], C['eye'], C['whiteD'])
    for x in range(dcx - 40, dcx + 40, 6):
        p.rect(x, base_top - 26, x + 2, base_top - 2, C['whiteD'])
    p.rect(dcx - 46, base_top - 32, dcx + 45, base_top - 30, C['whiteX'])
    p.ellipse(dcx - 40, base_top - 96, dcx + 40, base_top - 16, fill=C['lead'])
    p.rect(dcx - 41, base_top - 56, dcx + 41, base_top - 31, C['white'])
    p.ellipse(dcx - 40, base_top - 96, dcx + 40, base_top - 16, outline=C['leadD'])
    p.rect(dcx - 41, base_top - 56, dcx + 41, base_top - 31, C['white'])
    for x in range(dcx - 38, dcx + 38, 5):
        p.rect(x, base_top - 54, x + 1, base_top - 33, C['whiteD'])
    p.ellipse(dcx - 30, base_top - 92, dcx - 6, base_top - 70, fill=C['leadL'])
    for a in range(-3, 4):
        x = dcx + a * 11
        p.line([(x, base_top - 56), (dcx + a * 4, base_top - 94)], C['leadD'])
    box(p, dcx - 6, base_top - 112, 12, base_top - 94, C['white'], C['eye'], C['whiteD'])
    p.ellipse(dcx - 6, base_top - 120, dcx + 6, base_top - 108, fill=C['gold'])
    p.rect(dcx, base_top - 132, dcx, base_top - 118, C['gold'])
    p.rect(dcx - 3, base_top - 128, dcx + 3, base_top - 128, C['gold'])
    # The Gherkin: drawn row by row so the diagonal glazing stays inside it
    gx, gw, gh = ox + 420, 46, 160
    for row in range(gh):
        t = row / gh
        if t < 0.35:
            half = gw / 2 * (0.78 + 0.22 * t / 0.35)
        else:
            half = gw / 2 * math.sqrt(max(0.0, 1 - ((t - 0.35) / 0.65) ** 2))
        half = int(round(half))
        if half < 1:
            continue
        y = GROUND - row
        cxg = gx + gw // 2
        for x in range(cxg - half, cxg + half + 1):
            rel = (x - (cxg - half)) / max(1, 2 * half)
            stripe = ((x - gx) + row // 2) % 9 < 2
            if rel < 0.18:
                col = C['glassTL']
            elif rel > 0.72:
                col = C['glassTD']
            else:
                col = C['glassT']
            if stripe:
                col = C['glassTD'] if rel <= 0.72 else C['glassX']
            p.px(x, y, col)
    p.rect(gx + gw // 2 - 1, GROUND - gh - 3, gx + gw // 2, GROUND - gh, C['glassTD'])
    # Walkie-Talkie (wider at the top)
    wx = ox + 520
    p.poly([(wx + 6, GROUND), (wx + 44, GROUND), (wx + 52, GROUND - 120), (wx + 50, GROUND - 136), (wx - 2, GROUND - 136), (wx - 4, GROUND - 120)], C['glass'])
    p.poly([(wx + 26, GROUND), (wx + 44, GROUND), (wx + 52, GROUND - 120), (wx + 50, GROUND - 136), (wx + 26, GROUND - 136)], C['glassD'])
    for y in range(GROUND - 132, GROUND, 5):
        p.rect(wx + 6 - (GROUND - y) // 15, y, wx + 44 + (GROUND - y) // 15, y, C['glassW'])
    p.rect(wx - 2, GROUND - 142, wx + 50, GROUND - 137, C['greenL'])
    p.rect(wx + 2, GROUND - 145, wx + 46, GROUND - 143, C['grass'])
    # Cheesegrater (sloping wedge with yellow bracing)
    cx = ox + 600
    p.poly([(cx, GROUND), (cx + 50, GROUND), (cx + 50, GROUND - 176), (cx + 38, GROUND - 176)], C['glass'])
    p.poly([(cx + 30, GROUND), (cx + 50, GROUND), (cx + 50, GROUND - 176), (cx + 42, GROUND - 176)], C['glassD'])
    for y in range(GROUND - 168, GROUND - 6, 18):
        xl = cx + 38 * (GROUND - y) / 176
        p.line([(xl, y), (cx + 50, y + 18)], C['yellow'])
        p.line([(xl, y + 18), (cx + 50, y)], C['goldD'])
    # The Shard (south bank)
    shx, shw, shh = ox + 760, 80, 198
    p.poly([(shx, GROUND), (shx + shw, GROUND), (shx + shw // 2 + 4, GROUND - shh), (shx + shw // 2 - 4, GROUND - shh + 6)], C['glassL'])
    p.poly([(shx + shw // 2, GROUND), (shx + shw, GROUND), (shx + shw // 2 + 4, GROUND - shh)], C['glass'])
    p.poly([(shx + shw // 2 + 14, GROUND), (shx + shw, GROUND), (shx + shw // 2 + 4, GROUND - shh)], C['glassD'])
    for y in range(GROUND - shh + 20, GROUND, 6):
        half = (y - (GROUND - shh)) * shw // (2 * shh)
        p.rect(shx + shw // 2 - half + 2, y, shx + shw // 2 + half - 2, y, C['glassW'] if (y // 6) % 3 else C['glassD'])
    p.line([(shx + shw // 2 - 4, GROUND - shh + 6), (shx + shw // 2 - 8, GROUND - shh - 8)], C['glassL'])
    p.line([(shx + shw // 2 + 4, GROUND - shh), (shx + shw // 2 + 6, GROUND - shh - 12)], C['glass'])
    tree_row(p, ox + 268, ox + 340, 34)
    tree_row(p, ox + 700, ox + 755, 35)
    reflection(p, shx + 10, shx + shw - 10, C['riverH'])


# ── scene 4: Canary Wharf ────────────────────────────────────────────────

def crane(p, x, h, jib_left, jib_right):
    top = GROUND - h
    for y in range(top, GROUND, 6):
        p.rect(x, y, x + 5, y, C['goldD'])
        p.line([(x, y), (x + 5, y + 6)], C['yellow'])
    p.rect(x, top, x, GROUND, C['yellow'])
    p.rect(x + 5, top, x + 5, GROUND, C['goldD'])
    p.rect(x - jib_left, top - 4, x + jib_right, top - 1, C['yellow'])
    for k in range(x - jib_left, x + jib_right, 6):
        p.line([(k, top - 4), (k + 3, top - 1)], C['goldD'])
    p.rect(x - 2, top - 10, x + 7, top - 5, C['red'])
    p.rect(x - jib_left, top - 1, x - jib_left + 8, top + 5, C['lead'])
    p.line([(x + jib_right - 30, top - 1), (x + jib_right - 30, top + 40)], C['black'])


def scene_canary_wharf(p, ox):
    crane(p, ox + 90, 150, 50, 90)
    for i, (x, w, h, tint, crown) in enumerate([
            (200, 34, 120, 'glassT', 'step'), (250, 30, 150, 'glass', None),
            (330, 40, 178, 'glass', 'step'), (500, 40, 176, 'glassT', None),
            (560, 30, 130, 'glass', 'antenna'), (620, 36, 104, 'glassT', 'slant'),
            (700, 28, 140, 'glass', None), (860, 30, 112, 'glass', 'step')]):
        glass_tower(p, ox + x, w, h, tint=tint, crown=crown, rnd=random.Random(400 + i))
    # One Canada Square: steel tower with pyramid top and aircraft light
    cx, cw, ch = ox + 420, 50, 174
    top = GROUND - ch
    box(p, cx, top, cw, GROUND, C['whiteD'], C['eye'], C['whiteX'])
    for y in range(top + 4, GROUND - 2, 4):
        for x in range(cx + 4, cx + cw - 3, 4):
            p.rect(x, y, x + 1, y + 1, C['winD'] if (x + y) % 3 else C['glassW'])
    p.rect(cx + cw // 2, top, cx + cw - 3, GROUND, C['whiteX'])
    for y in range(top + 4, GROUND - 2, 4):
        p.rect(cx + cw // 2 + 2, y, cx + cw - 5, y, C['winB'])
    p.poly([(cx + 2, top), (cx + cw // 2, top - 26), (cx + cw - 3, top)], C['eye'])
    p.poly([(cx + cw // 2, top - 26), (cx + cw - 3, top), (cx + cw // 2, top)], C['whiteX'])
    p.rect(cx + cw // 2 - 1, top - 30, cx + cw // 2 + 1, top - 27, C['red'])
    p.rect(cx + cw // 2 - 3, top - 29, cx + cw // 2 + 3, top - 28, C['red'])
    # elevated light railway with a train
    ry = GROUND - 34
    p.rect(ox, ry, ox + PW - 1, ry + 4, C['whiteD'])
    p.rect(ox, ry, ox + PW - 1, ry, C['eye'])
    p.rect(ox, ry + 5, ox + PW - 1, ry + 5, C['whiteX'])
    for x in range(ox + 12, ox + PW, 48):
        p.rect(x, ry + 5, x + 5, GROUND, C['whiteX'])
        p.rect(x, ry + 5, x + 1, GROUND, C['eye'])
    tx = ox + 560
    for car in range(3):
        x0 = tx + car * 44
        p.rect(x0, ry - 14, x0 + 40, ry - 1, C['red'])
        p.rect(x0, ry - 14, x0 + 40, ry - 13, C['redD'])
        p.rect(x0, ry - 4, x0 + 40, ry - 3, C['blue'])
        for wx in range(x0 + 4, x0 + 38, 7):
            p.rect(wx, ry - 11, wx + 4, ry - 7, C['winB'])
            p.px(wx, ry - 11, C['glassW'])
    p.poly([(tx + 132, ry - 14), (tx + 140, ry - 8), (tx + 140, ry - 1), (tx + 132, ry - 1)], C['red'])
    crane(p, ox + 780, 168, 70, 60)
    tree_row(p, ox + 140, ox + 196, 41)
    tree_row(p, ox + 740, ox + 850, 42)
    reflection(p, cx, cx + cw, C['riverH'])
    reflection(p, ox + 330, ox + 370, C['riverL'])


# ── scene 5: Greenwich ───────────────────────────────────────────────────

def scene_greenwich(p, ox):
    rnd = random.Random(55)
    # green hill with the Royal Observatory behind the college
    hill = [(ox + 570, GROUND)]
    for i in range(0, 61):
        t = i / 60
        hill.append((ox + 570 + 380 * t, GROUND - 4 - 88 * math.sin(math.pi * t) ** 0.8))
    hill.append((ox + 950, GROUND))
    p.poly(hill, C['grass'])
    p.line(hill[1:-1], C['greenL'], 2)
    for i in range(0, 60, 3):
        x, y = hill[1 + i]
        p.rect(x, y + 6, x + 2, y + 7, C['grassD'])
    obx = ox + 800
    brick_block(p, obx, 40, 18, base=GROUND - 84, rnd=rnd, roof=False, chimneys=False)
    p.ellipse(obx + 8, GROUND - 120, obx + 32, GROUND - 96, fill=C['leadL'])
    p.rect(obx + 8, GROUND - 108, obx + 32, GROUND - 101, C['brick'])
    p.rect(obx + 19, GROUND - 130, obx + 20, GROUND - 120, C['black'])
    p.ellipse(obx + 16, GROUND - 136, obx + 23, GROUND - 129, fill=C['red'])
    tree_row(p, ox + 640, ox + 780, 51, GROUND - 40)
    tree_row(p, ox + 860, ox + 960, 52, GROUND - 46)
    # The O2 dome with yellow masts
    dx0, dx1, dh = ox + 70, ox + 340, 52
    dcx = (dx0 + dx1) // 2
    p.ellipse(dx0, GROUND - dh * 2, dx1, GROUND + 6, fill=C['white'])
    p.rect(dx0, GROUND, dx1, GROUND + 8, C['emb'])
    p.ellipse(dx0 + 20, GROUND - dh * 2 + 10, dcx, GROUND - dh, fill=C['eye'])
    for k in range(1, 10):
        x = dx0 + (dx1 - dx0) * k / 10
        h = math.sqrt(max(0, 1 - ((x - dcx) / ((dx1 - dx0) / 2)) ** 2)) * dh
        p.line([(x, GROUND - h), (dcx, GROUND - dh)], C['whiteD'])
    for i in range(12):
        u = -0.84 + 1.68 * i / 11
        bx_ = dcx + u * (dx1 - dx0) / 2
        h = math.sqrt(max(0.0, 1 - u * u)) * dh
        lean = 14 * u
        tx_, ty_ = bx_ + lean, GROUND - h - 34
        p.line([(tx_, ty_), (bx_ + lean * 2.4, GROUND - h * 0.45)], C['whiteX'])
        p.line([(tx_, ty_), (bx_ - lean * 0.6, GROUND - h + 1)], C['whiteX'])
        p.line([(bx_, GROUND - h + 2), (tx_, ty_)], C['yellow'], 3)
        p.px(round(tx_), round(ty_) - 1, C['goldD'])
    # Cutty Sark
    cx = ox + 420
    hull_top = GROUND - 22
    p.poly([(cx, hull_top), (cx + 150, hull_top - 4), (cx + 140, GROUND - 2), (cx + 14, GROUND - 2)], C['black'])
    p.rect(cx + 6, hull_top + 2, cx + 144, hull_top + 3, C['gold'])
    p.poly([(cx + 12, GROUND - 8), (cx + 142, GROUND - 8), (cx + 140, GROUND - 2), (cx + 14, GROUND - 2)], C['orange'])
    p.line([(cx + 150, hull_top - 4), (cx + 176, hull_top - 14)], C['trunk'], 2)
    masts = [(cx + 34, 120), (cx + 74, 132), (cx + 112, 112)]
    for mx, mh in masts:
        p.rect(mx, hull_top - mh, mx + 1, hull_top, C['trunk'])
        for k, yard in enumerate(range(hull_top - mh + 10, hull_top - 10, 20)):
            span = 14 + k * 4
            p.rect(mx - span, yard, mx + span, yard, C['trunk'])
    for (ax, ah), (bx_, bh) in zip(masts, masts[1:]):
        p.line([(ax, hull_top - ah), (bx_, hull_top - bh)], C['trunk'])
    p.line([(masts[0][0], hull_top - masts[0][1]), (cx + 2, hull_top)], C['trunk'])
    p.line([(masts[-1][0], hull_top - masts[-1][1]), (cx + 176, hull_top - 14)], C['trunk'])
    # Old Royal Naval College: twin domes
    for bx0 in (ox + 590, ox + 770):
        box(p, bx0, GROUND - 34, 150, GROUND, C['white'], C['eye'], C['whiteD'])
        for x in range(bx0 + 6, bx0 + 146, 8):
            p.rect(x, GROUND - 28, x + 3, GROUND - 22, C['winB'])
            p.rect(x, GROUND - 16, x + 3, GROUND - 6, C['winB'])
        p.rect(bx0, GROUND - 36, bx0 + 149, GROUND - 34, C['whiteX'])
    for dx in (ox + 730, ox + 790):
        box(p, dx - 12, GROUND - 74, 24, GROUND - 34, C['white'], C['eye'], C['whiteD'])
        for x in range(dx - 10, dx + 10, 4):
            p.rect(x, GROUND - 70, x + 1, GROUND - 38, C['whiteD'])
        p.ellipse(dx - 12, GROUND - 92, dx + 12, GROUND - 66, fill=C['lead'])
        p.rect(dx - 13, GROUND - 79, dx + 13, GROUND - 74, C['white'])
        p.rect(dx - 3, GROUND - 102, dx + 3, GROUND - 90, C['white'])
        p.rect(dx, GROUND - 110, dx, GROUND - 102, C['goldD'])
    tree_row(p, ox + 350, ox + 410, 53)
    reflection(p, cx + 10, cx + 140, C['riverL'])
    reflection(p, dx0, dx1, C['riverH'])


# ── scene 6: Camden / Shoreditch street art district + Battersea ─────────

GLYPHS = {
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
}


def tag(p, x, y, text, fill, outline, scale=2):
    for pass_, col, grow in ((0, outline, 1), (1, fill, 0)):
        for i, ch in enumerate(text):
            for r, row in enumerate(GLYPHS[ch]):
                for c, bit in enumerate(row):
                    if bit == '1':
                        x0 = x + (i * 6 + c) * scale
                        y0 = y + r * scale
                        p.rect(x0 - grow, y0 - grow, x0 + scale - 1 + grow, y0 + scale - 1 + grow, col)


def graffiti_wall(p, x0, x1, top, base, rnd):
    cols = [C['pink'], C['cyan'], C['lime'], C['purple'], C['orange'], C['yellow']]
    for _ in range((x1 - x0) // 10):
        x = rnd.randint(x0, x1 - 10)
        y = rnd.randint(top + 2, base - 8)
        w, h = rnd.randint(6, 18), rnd.randint(3, 8)
        p.ellipse(x, y, x + w, y + h, fill=rnd.choice(cols))
    for _ in range((x1 - x0) // 16):
        x = rnd.randint(x0, x1 - 12)
        y = rnd.randint(top + 2, base - 4)
        p.line([(x, y), (x + rnd.randint(4, 12), y - rnd.randint(-3, 3))], C['black'])


def scene_camden(p, ox):
    rnd = random.Random(66)
    # BT Tower in the distance
    bx = ox + 120
    box(p, bx, GROUND - 170, 18, GROUND, C['whiteD'], C['eye'], C['whiteX'])
    for y in range(GROUND - 166, GROUND - 110, 8):
        p.rect(bx - 3, y, bx + 20, y + 3, C['eye'])
        p.rect(bx - 3, y + 3, bx + 20, y + 3, C['whiteX'])
    for y in range(GROUND - 106, GROUND - 4, 4):
        p.rect(bx + 3, y, bx + 14, y, C['winB'])
    p.rect(bx + 8, GROUND - 192, bx + 9, GROUND - 170, C['whiteX'])
    p.px(bx + 8, GROUND - 193, C['red'])
    # Victorian terraces, brick and pastel, with street-art gable walls
    kinds = ['brick', 'stone', 'brick', 'white', 'brick']
    x = ox + 160
    for i, kind in enumerate(kinds):
        w = rnd.randint(46, 64)
        h = rnd.randint(46, 62)
        brick_block(p, x, w, h, rnd=rnd, kind=kind)
        if i in (1, 3):
            graffiti_wall(p, x + 2, x + w - 3, GROUND - h + 4, GROUND - 2, rnd)
        x += w + 2
    tag(p, ox + 172, GROUND - 26, 'NBG', C['pink'], C['black'])
    # Battersea Power Station
    px0 = ox + 520
    box(p, px0, GROUND - 70, 190, GROUND, C['brick'], C['brickL'], C['brickD'])
    for y in range(GROUND - 64, GROUND - 6, 4):
        p.rect(px0 + 4, y, px0 + 186, y, C['brickD'])
    for x in range(px0 + 30, px0 + 170, 16):
        p.rect(x, GROUND - 60, x + 5, GROUND - 10, C['winB'])
    p.rect(px0 + 40, GROUND - 82, px0 + 150, GROUND - 70, C['brickD'])
    for cxx in (px0 + 4, px0 + 44, px0 + 136, px0 + 176):
        p.rect(cxx, GROUND - 150, cxx + 12, GROUND - 70, C['white'])
        p.rect(cxx, GROUND - 150, cxx + 3, GROUND - 70, C['eye'])
        p.rect(cxx + 10, GROUND - 150, cxx + 12, GROUND - 70, C['whiteD'])
        p.rect(cxx - 1, GROUND - 152, cxx + 13, GROUND - 150, C['whiteX'])
        for y in range(GROUND - 140, GROUND - 74, 14):
            p.rect(cxx, y, cxx + 12, y, C['whiteD'])
    graffiti_wall(p, px0 + 4, px0 + 60, GROUND - 26, GROUND - 2, rnd)
    tag(p, px0 + 120, GROUND - 24, 'NBG', C['cyan'], C['black'])
    # railway viaduct with arches and a train
    vy = GROUND - 40
    p.rect(ox + 740, vy, ox + PW - 14, GROUND, C['brick'])
    p.rect(ox + 740, vy, ox + PW - 14, vy + 2, C['brickX'])
    p.rect(ox + PW - 18, vy, ox + PW - 14, GROUND, C['brickD'])
    for ax in range(ox + 746, ox + PW - 40, 30):
        p.ellipse(ax, vy + 8, ax + 22, vy + 30, fill=C['winB'])
        p.rect(ax, vy + 19, ax + 22, GROUND, C['winB'])
    graffiti_wall(p, ox + 742, ox + PW - 24, vy + 22, GROUND - 1, rnd)
    for car in range(3):
        x0 = ox + 760 + car * 58
        p.rect(x0, vy - 18, x0 + 54, vy - 1, C['greenD'])
        p.rect(x0, vy - 18, x0 + 54, vy - 16, C['green'])
        p.rect(x0, vy - 5, x0 + 54, vy - 3, C['yellow'])
        for wx in range(x0 + 4, x0 + 50, 8):
            p.rect(wx, vy - 13, wx + 5, vy - 8, C['winB'])
            p.px(wx, vy - 13, C['glassW'])
    tree_row(p, ox + 470, ox + 515, 61)
    tree_row(p, ox + 714, ox + 736, 62)
    reflection(p, px0, px0 + 190, C['riverL'])


# ── sky ───────────────────────────────────────────────────────────────────

def cloud(d, x, y, s, rnd, W):
    puffs = [(rnd.randint(-s * 2, s * 2), rnd.randint(-s // 2, s // 3), rnd.randint(s // 2, s)) for _ in range(6)]
    for o in (-W, 0, W):
        for dx, dy, r in puffs:
            d.ellipse([x + dx - r + o, y + dy - r + 3, x + dx + r + o, y + dy + r + 3], fill='#b9d6f2')
        for dx, dy, r in puffs:
            d.ellipse([x + dx - r + o, y + dy - r, x + dx + r + o, y + dy + r], fill='#ffffff')
        for dx, dy, r in puffs[:3]:
            d.ellipse([x + dx - r // 2 + o, y + dy - r + 1, x + dx + r // 3 + o, y + dy - r // 3], fill='#ffffff')


def make_sky():
    W, H = 480 * GRID, 270 * GRID
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    stops = ['#1c5fd0', '#2369da', '#2c74e2', '#3780e8', '#448dee', '#529af2',
             '#62a8f5', '#73b5f8', '#86c2fa', '#9acefc', '#aed8fd']
    # ordered (Bayer 4x4) dither between neighbouring stops: smooth, no seams
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    rgb = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in stops]
    px = img.load()
    for y in range(H):
        f = y / (H - 1) * (len(stops) - 1)
        lo = min(int(f), len(stops) - 2)
        frac = f - lo
        row = bayer[y % 4]
        for x in range(W):
            px[x, y] = rgb[lo + 1] if frac * 16 > row[x % 4] + 0.5 else rgb[lo]
    rnd = random.Random(909)
    for _ in range(9):
        cloud(d, rnd.randrange(0, W), rnd.randint(30, int(H * 0.55)), rnd.randint(10, 22), rnd, W)
    return img


# ── build ─────────────────────────────────────────────────────────────────

SCENE_FUNCS = {
    'westminster': scene_westminster,
    'tower-bridge': scene_tower_bridge,
    'the-city': scene_the_city,
    'canary-wharf': scene_canary_wharf,
    'greenwich': scene_greenwich,
    'camden-shoreditch': scene_camden,
}


def build(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    pano = Pano(TW, PH)
    haze_layers(pano)
    embankment_and_river(pano)
    for i, name in enumerate(SCENES):
        fn = SCENE_FUNCS.get(name)
        if fn:
            fn(pano, i * PW)
    for i, name in enumerate(SCENES):
        panel = pano.img.crop((i * PW, 0, (i + 1) * PW, PH))
        panel = panel.resize((PW * EXPORT, PH * EXPORT), Image.NEAREST)
        panel.save(os.path.join(out_dir, 'london-scene-%d-%s.png' % (i + 1, name)), optimize=True)
    sky = make_sky().resize((480 * GRID * EXPORT, 270 * GRID * EXPORT), Image.NEAREST)
    sky.save(os.path.join(out_dir, 'london-sky.png'), optimize=True)
    return pano


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'game/assets/world/london'
    build(out)
    print('wrote', out)
