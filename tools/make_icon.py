# -*- coding: utf-8 -*-
# 홈화면 아이콘 생성: assets/icon-180.png, assets/icon-512.png
from PIL import Image, ImageDraw
import math, os
os.makedirs('assets', exist_ok=True)
for n in (180, 512):
    im = Image.new('RGBA', (n, n), '#1b2430'); d = ImageDraw.Draw(im)
    c = n / 2; R = n * 0.42
    pts = [(c + R * math.cos(math.radians(60 * i - 30)), c + R * math.sin(math.radians(60 * i - 30))) for i in range(6)]
    d.polygon(pts, fill='#a8d08d', outline='#2f80ed', width=max(4, n // 28))
    r2 = R * 0.35
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill='#2f80ed')
    im.save(f'assets/icon-{n}.png')
print('ok')
