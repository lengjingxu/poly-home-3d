#!/usr/bin/env python3
"""程序化生成保利智家 3D 中控用的公寓模型（.glb）。

坐标：右手系，Y 向上，单位米。X 向东，Z 向南。
墙做 1.2 m 剖切（dollhouse），方便从上往下看进房间。
整体坐在一块深色底座上，像摆在桌上的建筑模型。
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

WALL_H = 1.20
WALL_T = 0.12
FLOOR_T = 0.12
PLINTH_T = 0.20
BAND_H = 0.02

MATERIALS = {
    "floor_wood":  {"color": (0.62, 0.44, 0.28), "rough": 0.58, "metal": 0.0},
    "floor_tile":  {"color": (0.78, 0.76, 0.72), "rough": 0.35, "metal": 0.0},
    "floor_rug":   {"color": (0.52, 0.40, 0.31), "rough": 0.95, "metal": 0.0},
    "wall":        {"color": (0.88, 0.86, 0.82), "rough": 0.92, "metal": 0.0},
    "wall_cap":    {"color": (0.96, 0.94, 0.91), "rough": 0.85, "metal": 0.0},
    "plinth":      {"color": (0.10, 0.10, 0.11), "rough": 0.55, "metal": 0.2},
    "wood_dark":   {"color": (0.35, 0.23, 0.15), "rough": 0.55, "metal": 0.0},
    "wood_light":  {"color": (0.62, 0.44, 0.27), "rough": 0.50, "metal": 0.0},
    "fabric":      {"color": (0.62, 0.58, 0.53), "rough": 0.98, "metal": 0.0},
    "fabric_dark": {"color": (0.40, 0.37, 0.35), "rough": 0.98, "metal": 0.0},
    "duvet":       {"color": (0.90, 0.87, 0.82), "rough": 0.98, "metal": 0.0},
    "stone":       {"color": (0.72, 0.71, 0.68), "rough": 0.25, "metal": 0.0},
    "white":       {"color": (0.90, 0.90, 0.88), "rough": 0.30, "metal": 0.1},
    "metal":       {"color": (0.60, 0.62, 0.65), "rough": 0.28, "metal": 0.9},
    "metal_dark":  {"color": (0.16, 0.16, 0.18), "rough": 0.40, "metal": 0.7},
    "glass":       {"color": (0.42, 0.52, 0.62), "rough": 0.06, "metal": 0.0},
    "screen":      {"color": (0.06, 0.06, 0.08), "rough": 0.15, "metal": 0.3},
    "plant":       {"color": (0.24, 0.38, 0.24), "rough": 0.88, "metal": 0.0},
    "ceramic":     {"color": (0.85, 0.80, 0.72), "rough": 0.35, "metal": 0.0},
    "art":         {"color": (0.72, 0.45, 0.28), "rough": 0.75, "metal": 0.0},
}


class Group:
    """一个材质对应的一批三角形。"""

    def __init__(self) -> None:
        self.pos: list[float] = []
        self.nrm: list[float] = []
        self.idx: list[int] = []

    def add_quad(self, verts, normal) -> None:
        base = len(self.pos) // 3
        for v in verts:
            self.pos.extend(v)
            self.nrm.extend(normal)
        self.idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_triangle(self, verts, normal) -> None:
        base = len(self.pos) // 3
        for v in verts:
            self.pos.extend(v)
            self.nrm.extend(normal)
        self.idx.extend([base, base + 1, base + 2])

    def add_box(self, cx, cy, cz, sx, sy, sz, rot_y=0.0) -> None:
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        corners = [
            (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
            (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
        ]
        ca, sa = math.cos(rot_y), math.sin(rot_y)

        def place(p):
            x, y, z = p
            return (cx + x * ca + z * sa, cy + y, cz - x * sa + z * ca)

        v = [place(p) for p in corners]
        faces = [
            ((4, 5, 6, 7), (sa, 0, ca)),
            ((1, 0, 3, 2), (-sa, 0, -ca)),
            ((5, 1, 2, 6), (ca, 0, -sa)),
            ((0, 4, 7, 3), (-ca, 0, sa)),
            ((3, 7, 6, 2), (0, 1, 0)),
            ((0, 1, 5, 4), (0, -1, 0)),
        ]
        for idx, normal in faces:
            self.add_quad([v[i] for i in idx], normal)

    def add_cyl(self, cx, cy, cz, r, h, seg=14, cap=True) -> None:
        y0, y1 = cy - h / 2, cy + h / 2
        for i in range(seg):
            a0 = 2 * math.pi * i / seg
            a1 = 2 * math.pi * (i + 1) / seg
            x0, z0 = cx + r * math.cos(a0), cz + r * math.sin(a0)
            x1, z1 = cx + r * math.cos(a1), cz + r * math.sin(a1)
            self.add_quad(
                [(x0, y0, z0), (x1, y0, z1), (x1, y1, z1), (x0, y1, z0)],
                ((math.cos(a0) + math.cos(a1)) / 2, 0.0, (math.sin(a0) + math.sin(a1)) / 2),
            )
            if cap:
                self.add_quad(
                    [(cx, y1, cz), (x1, y1, z1), (x0, y1, z0), (cx, y1, cz)],
                    (0.0, 1.0, 0.0),
                )


def polygon_area(points) -> float:
    return sum(points[i][0] * points[(i + 1) % len(points)][1]
               - points[(i + 1) % len(points)][0] * points[i][1]
               for i in range(len(points))) / 2


def triangulate(points):
    points = list(points)
    if polygon_area(points) < 0:
        points.reverse()
    remaining = list(range(len(points)))
    triangles = []

    def inside(point, a, b, c) -> bool:
        px, py = point
        ab = (b[0] - a[0], b[1] - a[1])
        bc = (c[0] - b[0], c[1] - b[1])
        ca = (a[0] - c[0], a[1] - c[1])
        ap = (px - a[0], py - a[1])
        bp = (px - b[0], py - b[1])
        cp = (px - c[0], py - c[1])
        cross = lambda u, v: u[0] * v[1] - u[1] * v[0]
        return cross(ab, ap) >= 0 and cross(bc, bp) >= 0 and cross(ca, cp) >= 0

    while len(remaining) > 3:
        ear = False
        for i, curr in enumerate(remaining):
            prev = remaining[i - 1]
            nxt = remaining[(i + 1) % len(remaining)]
            a, b, c = points[prev], points[curr], points[nxt]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 1e-6:
                continue
            if any(
                other not in (prev, curr, nxt) and inside(points[other], a, b, c)
                for other in remaining
            ):
                continue
            triangles.append((a, b, c))
            remaining.pop(i)
            ear = True
            break
        if not ear:
            return [(points[0], points[i], points[i + 1]) for i in range(1, len(points) - 1)]
    triangles.append(tuple(points[i] for i in remaining))
    return triangles


class Model:
    def __init__(self) -> None:
        self.groups: dict[str, Group] = {}

    def g(self, material: str) -> Group:
        return self.groups.setdefault(material, Group())

    def box(self, material, cx, cy, cz, sx, sy, sz, rot_y=0.0) -> None:
        self.g(material).add_box(cx, cy, cz, sx, sy, sz, rot_y)

    def cyl(self, material, cx, cy, cz, r, h, seg=14) -> None:
        self.g(material).add_cyl(cx, cy, cz, r, h, seg)

    def slab(self, material, x0, z0, x1, z1, y0=0.0, thickness=FLOOR_T) -> None:
        self.box(material, (x0 + x1) / 2, y0 - thickness / 2, (z0 + z1) / 2,
                 x1 - x0, thickness, z1 - z0)

    def poly_slab(self, material, points, y0=0.0, thickness=FLOOR_T) -> None:
        points = list(points)
        for a, b, c in triangulate(points):
            self.g(material).add_triangle([(a[0], y0, a[1]), (b[0], y0, b[1]), (c[0], y0, c[1])], (0, 1, 0))
            self.g(material).add_triangle(
                [(c[0], y0 - thickness, c[1]), (b[0], y0 - thickness, b[1]), (a[0], y0 - thickness, a[1])],
                (0, -1, 0),
            )
        for i, (x0, z0) in enumerate(points):
            x1, z1 = points[(i + 1) % len(points)]
            dx, dz = x1 - x0, z1 - z0
            length = math.hypot(dx, dz)
            if length < 0.01:
                continue
            self.g(material).add_quad(
                [(x0, y0 - thickness, z0), (x1, y0 - thickness, z1), (x1, y0, z1), (x0, y0, z0)],
                (dz / length, 0, -dx / length),
            )

    def wall_segment(self, material, p0, p1, gaps=(), height=WALL_H) -> None:
        x0, z0 = p0
        x1, z1 = p1
        dx, dz = x1 - x0, z1 - z0
        length = math.hypot(dx, dz)
        if length < 0.01:
            return
        angle = math.atan2(-dz, dx)
        cursor = 0.0
        for start, end in sorted(gaps):
            start, end = max(0, start), min(length, end)
            if start > cursor:
                self._wall_piece(material, p0, dx, dz, cursor, start, angle, height)
            cursor = max(cursor, end)
        if cursor < length:
            self._wall_piece(material, p0, dx, dz, cursor, length, angle, height)

    def _wall_piece(self, material, p0, dx, dz, start, end, angle, height) -> None:
        length = end - start
        mid = (start + end) / 2
        self.box(
            material,
            p0[0] + dx / math.hypot(dx, dz) * mid,
            height / 2,
            p0[1] + dz / math.hypot(dx, dz) * mid,
            length,
            height,
            WALL_T,
            angle,
        )
        self.box(
            "wall_cap",
            p0[0] + dx / math.hypot(dx, dz) * mid,
            height + BAND_H / 2,
            p0[1] + dz / math.hypot(dx, dz) * mid,
            length,
            BAND_H,
            WALL_T,
            angle,
        )

    def wall_run(self, material, axis, fixed, start, end, gaps, height=WALL_H) -> None:
        """axis='x' 表示墙沿 X 方向延伸（fixed 是 z），反之亦然。"""
        segments = []
        cursor = start
        for g0, g1 in sorted(gaps):
            if g0 > cursor:
                segments.append((cursor, g0))
            cursor = max(cursor, g1)
        if cursor < end:
            segments.append((cursor, end))
        for a, b in segments:
            if b - a < 0.01:
                continue
            length, mid = b - a, (a + b) / 2
            if axis == "x":
                self.box(material, mid, height / 2, fixed, length, height, WALL_T)
                self.box("wall_cap", mid, height + BAND_H / 2, fixed, length, BAND_H, WALL_T)
            else:
                self.box(material, fixed, height / 2, mid, WALL_T, height, length)
                self.box("wall_cap", fixed, height + BAND_H / 2, mid, WALL_T, BAND_H, length)


ROOM_POLYGONS = {
    "主卧": [
        (1.90, 0.02), (2.46, 0.02), (2.46, 1.78), (3.82, 1.78),
        (3.82, 0.02), (5.90, 0.02), (5.90, 0.73), (6.14, 0.73),
        (6.14, 0.02), (6.88, 0.02), (6.88, 0.55), (7.25, 0.55),
        (7.25, 0.02), (8.54, 0.02), (8.54, 1.84), (6.00, 1.84),
        (6.00, 4.38), (5.06, 4.38), (5.06, 3.20), (1.94, 3.20),
    ],
    "衣帽间": [(6.00, 1.90), (8.54, 1.90), (8.54, 4.45), (6.35, 4.45), (6.00, 4.05)],
    "卫生间": [(6.10, 4.58), (8.54, 4.58), (8.54, 6.16), (7.92, 6.16),
               (7.92, 5.63), (7.35, 5.63), (7.35, 6.16), (6.10, 6.16)],
    "走廊": [(4.68, 4.42), (6.00, 4.42), (6.00, 6.45), (5.05, 6.45),
             (5.05, 6.15), (4.68, 6.15)],
    "次卧": [(1.76, 3.88), (4.30, 3.88), (4.65, 4.32), (4.65, 6.15),
             (4.05, 6.15), (4.05, 6.40), (1.76, 6.40)],
    "客餐厨": [(1.75, 6.65), (5.05, 6.65), (5.05, 7.25), (8.54, 7.05),
               (8.54, 9.90), (10.95, 9.90), (10.95, 11.05), (11.10, 11.05),
               (11.10, 12.45), (10.90, 12.45), (10.90, 12.75), (8.65, 12.75),
               (8.65, 13.00), (2.00, 13.00), (2.00, 12.25), (1.75, 12.25),
               (1.75, 10.65), (0.05, 10.65), (0.05, 8.45), (0.65, 8.80),
               (1.75, 9.35)],
}

OUTER_WALL = [
    (1.90, 0.00), (2.46, 0.00), (2.46, 1.78), (3.82, 1.78), (3.82, 0.00),
    (5.90, 0.00), (5.90, 0.73), (6.14, 0.73), (6.14, 0.00), (6.88, 0.00),
    (6.88, 0.55), (7.25, 0.55), (7.25, 0.00), (8.54, 0.00), (8.54, 1.84),
    (8.54, 4.58), (8.54, 6.16), (8.54, 7.05), (8.54, 9.90), (10.95, 9.90),
    (10.95, 11.05), (11.10, 11.05), (11.10, 12.45), (10.90, 12.45),
    (10.90, 12.75), (8.65, 12.75), (8.65, 13.00), (2.00, 13.00),
    (2.00, 12.25), (1.75, 12.25), (1.75, 10.65), (0.05, 10.65),
    (0.05, 8.45), (0.65, 8.80), (1.75, 9.35), (1.75, 6.40), (1.75, 3.88),
    (1.90, 3.20),
]

INTERIOR_WALLS = [
    ((1.94, 3.20), (5.06, 3.20), [(2.40, 3.25)]),
    ((1.76, 3.88), (4.30, 3.88), [(2.35, 3.15)]),
    ((4.65, 4.32), (4.65, 6.15), [(0.25, 1.05)]),
    ((1.76, 6.40), (4.65, 6.40), [(2.10, 2.95)]),
    ((5.06, 3.20), (5.06, 4.38), [(0.18, 0.88)]),
    ((6.00, 1.90), (6.00, 4.05), [(0.85, 1.65)]),
    ((6.00, 4.45), (8.54, 4.45), [(0.85, 1.65)]),
    ((6.10, 4.58), (8.54, 4.58), [(0.80, 1.60)]),
    ((6.10, 4.58), (6.10, 6.16), [(0.35, 1.10)]),
    ((6.00, 5.40), (6.00, 6.45), [(0.35, 1.00)]),
    ((4.68, 6.15), (5.05, 6.15), []),
]

WINDOWS = [
    ((3.82, 0.02), (5.90, 0.02), 0.15, 1.85),
    ((7.25, 0.02), (8.54, 0.02), 0.10, 1.15),
    ((1.90, 0.02), (1.90, 3.20), 0.25, 2.65),
    ((2.00, 13.00), (8.65, 13.00), 0.20, 6.10),
    ((10.95, 11.05), (10.95, 12.45), 0.10, 1.25),
    ((0.05, 8.45), (0.05, 10.65), 0.20, 1.60),
]
WINDOW_SILL = 0.34
WINDOW_HEAD = 1.02


def build_floors(m: Model) -> None:
    for name, points in ROOM_POLYGONS.items():
        m.poly_slab("floor_tile" if name == "卫生间" else "floor_wood", points)
    m.slab("plinth", -0.26, -0.26, 11.36, 13.26, y0=-FLOOR_T, thickness=PLINTH_T)


def build_walls(m: Model) -> None:
    for i, start in enumerate(OUTER_WALL):
        m.wall_segment("wall", start, OUTER_WALL[(i + 1) % len(OUTER_WALL)])
    for p0, p1, gaps in INTERIOR_WALLS:
        m.wall_segment("wall", p0, p1, gaps)


def build_windows(m: Model) -> None:
    """把外墙洞口补上玻璃和窗框。"""
    frame_t = 0.05
    for p0, p1, start, end in WINDOWS:
        dx, dz = p1[0] - p0[0], p1[1] - p0[1]
        length = math.hypot(dx, dz)
        angle = math.atan2(-dz, dx)
        unit = (dx / length, dz / length)
        mid = (start + end) / 2
        cx = p0[0] + unit[0] * mid
        cz = p0[1] + unit[1] * mid
        span = end - start
        h = WINDOW_HEAD - WINDOW_SILL
        cy = WINDOW_SILL + h / 2
        m.box("glass", cx, cy, cz, span - 0.04, h - 0.04, 0.03, angle)
        m.box("metal_dark", cx, WINDOW_SILL - frame_t / 2, cz, span, frame_t, 0.16, angle)
        m.box("metal_dark", cx, WINDOW_HEAD + frame_t / 2, cz, span, frame_t, 0.16, angle)
        for at in (start, mid, end):
            fx = p0[0] + unit[0] * at
            fz = p0[1] + unit[1] * at
            m.box("metal_dark", fx, cy, fz, frame_t, h, 0.16, angle)


def build_door_frames(m: Model) -> None:
    """门洞两侧的竖向门套。"""
    jambs = [
        (5.06, 3.38, math.pi / 2), (5.06, 4.20, math.pi / 2),
        (4.65, 4.55, 0), (4.65, 5.35, 0),
        (3.95, 6.40, 0), (4.77, 6.40, 0),
        (6.00, 2.75, math.pi / 2), (6.00, 3.55, math.pi / 2),
        (6.85, 4.45, 0), (7.65, 4.45, 0),
        (6.10, 4.90, 0), (6.10, 5.70, 0),
    ]
    for x, z, rot in jambs:
        m.box("wood_light", x, WALL_H / 2, z, 0.07, WALL_H, WALL_T + 0.02, rot)


def build_doors(m: Model) -> None:
    """开着的门扇，给剖切模型一点生活感。"""
    leaves = [
        (5.06, 3.82, 0.82, 0.0),
        (4.65, 4.95, 0.82, math.pi / 2),
        (4.36, 6.40, 0.82, math.pi),
        (6.00, 3.15, 0.82, math.pi / 2),
        (7.25, 4.45, 0.82, 0.0),
        (6.10, 5.30, 0.82, math.pi / 2),
    ]
    for x, z, width, angle in leaves:
        m.box("wood_light", x, WALL_H / 2 - 0.02, z, width, WALL_H - 0.06, 0.04, rot_y=angle)


def bed(m: Model, x, z, w, l, rot=0.0) -> None:
    """床：床架 + 床垫 + 被子 + 两只枕头 + 床头板。"""
    m.box("wood_light", x, 0.13, z, w, 0.26, l, rot)
    m.box("duvet", x, 0.36, z, w - 0.08, 0.20, l - 0.10, rot)
    m.box("fabric_dark", x, 0.50, z + l / 2 - 0.32, w - 0.06, 0.12, 0.62, rot)
    head = -l / 2 + 0.03
    ca, sa = math.cos(rot), math.sin(rot)
    for dx in (-w / 4, w / 4):
        px = x + dx * ca + head * sa
        pz = z - dx * sa + head * ca
        m.box("white", px, 0.52, pz, w / 2 - 0.14, 0.14, 0.34, rot)
    hx = x + (head - 0.03) * sa
    hz = z + (head - 0.03) * ca
    m.box("wood_dark", hx, 0.46, hz, w + 0.04, 0.92, 0.06, rot)


def sofa(m: Model, x, z, w, d=0.92) -> None:
    m.box("fabric", x, 0.20, z, w, 0.34, d)
    m.box("fabric_dark", x, 0.52, z + d / 2 - 0.10, w, 0.40, 0.20)
    for side in (-1, 1):
        m.box("fabric_dark", x + side * (w / 2 - 0.10), 0.38, z, 0.20, 0.36, d)
    for i in (-1, 0, 1):
        m.box("duvet", x + i * w / 3.4, 0.40, z - 0.06, w / 3.8, 0.10, d - 0.32)


def table(m: Model, x, z, w, d, h=0.40, top="wood_light", leg="wood_dark") -> None:
    m.box(top, x, h, z, w, 0.05, d)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(leg, x + sx * (w / 2 - 0.08), h / 2, z + sz * (d / 2 - 0.08), 0.06, h, 0.06)


def chair(m: Model, x, z, rot=0.0) -> None:
    m.box("fabric", x, 0.22, z, 0.42, 0.08, 0.42, rot)
    ca, sa = math.cos(rot), math.sin(rot)
    bx = x + 0.18 * sa
    bz = z + 0.18 * ca
    m.box("fabric_dark", bx, 0.38, bz, 0.42, 0.42, 0.06, rot)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box("wood_dark", x + sx * 0.17, 0.09, z + sz * 0.17, 0.04, 0.18, 0.04, rot)


def plant(m: Model, x, z, h=0.46, r=0.30) -> None:
    m.cyl("ceramic", x, 0.10, z, 0.15, 0.20, 12)
    m.box("plant", x, 0.20 + h / 2, z, r, h, r * 0.9)
    m.box("plant", x, 0.28 + h, z, r * 0.6, h * 0.6, r * 0.55)


def rug(m: Model, x0, z0, x1, z1) -> None:
    m.slab("floor_rug", x0, z0, x1, z1, y0=0.012, thickness=0.012)


def wardrobe(m: Model, x, z, w, d, h=1.05) -> None:
    m.box("wood_dark", x, h / 2, z, w, h, d)
    m.box("wood_light", x, h / 2, z + d / 2 + 0.01, w - 0.06, h - 0.08, 0.02)
    m.box("metal", x, h * 0.55, z + d / 2 + 0.03, w - 0.06, 0.02, 0.03)


def counter(m: Model, x0, z0, x1, z1, h=0.86) -> None:
    m.box("white", (x0 + x1) / 2, h / 2 - 0.02, (z0 + z1) / 2, x1 - x0, h - 0.04, z1 - z0)
    m.box("stone", (x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 0.03, 0.05, z1 - z0 + 0.03)


def furniture(m: Model) -> None:
    rug(m, 2.45, 9.00, 7.70, 11.60)
    sofa(m, 5.20, 11.30, 3.10, 0.96)
    table(m, 5.20, 10.15, 1.15, 0.68, 0.36)
    m.box("screen", 2.20, 0.86, 10.25, 1.55, 0.88, 0.05)
    m.box("wood_dark", 2.20, 0.25, 10.25, 2.00, 0.36, 0.42)
    m.box("metal_dark", 2.20, 0.45, 10.25, 0.30, 0.10, 0.16)
    plant(m, 8.15, 11.95, 0.55)

    table(m, 3.35, 8.00, 1.70, 0.86, 0.40)
    for dx in (-0.58, 0.58):
        chair(m, 3.35 + dx, 7.38)
        chair(m, 3.35 + dx, 8.62, math.pi)
    m.box("wood_dark", 1.15, 0.50, 9.78, 1.45, 0.92, 0.42)
    m.box("wood_light", 1.15, 1.00, 9.78, 1.48, 0.04, 0.46)
    m.box("fabric", 1.55, 0.24, 9.05, 0.46, 0.44, 0.90)

    counter(m, 6.15, 7.00, 8.45, 7.58)
    counter(m, 7.85, 7.58, 8.45, 8.55)
    counter(m, 6.35, 8.25, 7.55, 8.82, 0.92)
    m.box("metal", 6.65, 0.92, 7.28, 0.56, 0.04, 0.42)
    m.box("metal_dark", 7.55, 0.92, 7.28, 0.60, 0.05, 0.44)
    m.box("white", 8.20, 0.88, 8.18, 0.52, 1.70, 0.62)
    m.box("metal", 8.20, 0.92, 8.18, 0.02, 1.54, 0.58)

    bed(m, 3.45, 1.70, 1.82, 2.25)
    m.cyl("wood_light", 2.28, 0.24, 0.48, 0.20, 0.48, 14)
    m.cyl("ceramic", 2.28, 0.55, 0.48, 0.13, 0.22, 14)
    wardrobe(m, 5.22, 2.72, 0.54, 1.12)
    rug(m, 2.40, 0.72, 4.55, 2.90)

    bed(m, 3.12, 5.18, 1.56, 2.00)
    table(m, 2.08, 5.22, 0.48, 0.48, 0.48)
    chair(m, 2.10, 5.82, math.pi)
    wardrobe(m, 4.18, 5.10, 0.48, 1.10)
    rug(m, 2.18, 4.32, 4.10, 6.05)

    wardrobe(m, 7.25, 2.82, 1.55, 0.52)
    wardrobe(m, 7.25, 3.58, 1.55, 0.52)
    m.box("metal", 7.25, 0.70, 2.98, 0.66, 0.06, 0.36)
    m.box("white", 6.62, 0.20, 5.18, 0.48, 0.38, 0.42)
    m.cyl("ceramic", 7.65, 0.20, 5.22, 0.23, 0.40, 14)
    m.box("white", 8.12, 0.28, 5.90, 0.44, 0.56, 0.48)
    m.box("art", 5.48, 0.78, 5.48, 0.52, 0.44, 0.03)


def export_glb(model: Model, path: Path) -> None:
    buffer = bytearray()
    buffer_views = []
    accessors = []
    materials = []
    primitives = []

    def add_view(data: bytes, target: int) -> int:
        while len(buffer) % 4:
            buffer.append(0)
        offset = len(buffer)
        buffer.extend(data)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(buffer_views) - 1

    for name, spec in MATERIALS.items():
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [spec["color"][0], spec["color"][1], spec["color"][2], 1.0],
                "metallicFactor": spec["metal"],
                "roughnessFactor": spec["rough"],
            },
            "doubleSided": False,
        })

    for name, group in model.groups.items():
        if not group.idx:
            continue
        pos = struct.pack("<%df" % len(group.pos), *group.pos)
        nrm = struct.pack("<%df" % len(group.nrm), *group.nrm)
        idx = struct.pack("<%dI" % len(group.idx), *group.idx)
        vertices = len(group.pos) // 3
        mins = [min(group.pos[i::3]) for i in range(3)]
        maxs = [max(group.pos[i::3]) for i in range(3)]
        pos_view = add_view(pos, 34962)
        nrm_view = add_view(nrm, 34962)
        idx_view = add_view(idx, 34963)
        accessors.append({"bufferView": pos_view, "componentType": 5126, "count": vertices,
                          "type": "VEC3", "min": mins, "max": maxs})
        pos_acc = len(accessors) - 1
        accessors.append({"bufferView": nrm_view, "componentType": 5126, "count": vertices, "type": "VEC3"})
        nrm_acc = len(accessors) - 1
        accessors.append({"bufferView": idx_view, "componentType": 5125, "count": len(group.idx), "type": "SCALAR"})
        idx_acc = len(accessors) - 1
        primitives.append({
            "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc},
            "indices": idx_acc,
            "material": list(MATERIALS).index(name),
            "mode": 4,
        })

    gltf = {
        "asset": {"version": "2.0", "generator": "poly-home-3d-model"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Apartment"}],
        "meshes": [{"name": "Apartment", "primitives": primitives}],
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer)}],
    }

    json_chunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    bin_chunk = bytes(buffer) + b"\x00" * ((4 - len(buffer) % 4) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    out = bytearray()
    out += b"glTF" + struct.pack("<II", 2, total)
    out += struct.pack("<I", len(json_chunk)) + b"JSON" + json_chunk
    out += struct.pack("<I", len(bin_chunk)) + b"BIN\x00" + bin_chunk
    path.write_bytes(out)
    tris = sum(len(g.idx) for g in model.groups.values()) // 3
    print(f"{path}  {len(out)/1024:.1f} KB  {tris} 三角形  {len(model.groups)} 种材质")


def main() -> None:
    model = Model()
    build_floors(model)
    build_walls(model)
    build_windows(model)
    build_door_frames(model)
    furniture(model)
    build_doors(model)
    out = Path(__file__).with_name("poly-home.glb")
    export_glb(model, out)


if __name__ == "__main__":
    main()
