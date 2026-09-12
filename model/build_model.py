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
    "glass_tint":  {"color": (0.48, 0.28, 0.18), "rough": 0.12, "metal": 0.05},
    "island":      {"color": (0.48, 0.13, 0.12), "rough": 0.42, "metal": 0.05},
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
    "主卫": [(0.10, 0.05), (1.55, 0.05), (1.55, 4.00), (0.10, 4.00)],
    "衣帽间": [(1.60, 0.05), (5.80, 0.05), (5.80, 4.00), (1.60, 4.00)],
    "卫生间": [(5.95, 0.05), (8.05, 0.05), (8.05, 3.65), (5.95, 3.65)],
    "走廊": [(5.75, 3.70), (8.05, 3.70), (8.05, 4.65), (5.75, 4.65)],
    "主卧": [(0.10, 4.05), (3.40, 4.05), (3.40, 9.60), (0.10, 9.60)],
    "次卧": [(3.45, 4.05), (6.25, 4.05), (6.25, 9.60), (3.45, 9.60)],
    "客餐厨": [(8.10, 0.05), (10.80, 0.05), (10.80, 1.25), (12.45, 1.25),
               (12.45, 10.15), (8.55, 10.15), (8.55, 9.05), (6.20, 9.05),
               (6.20, 4.65), (8.10, 4.65)],
    "阳台": [(8.55, 10.20), (12.45, 10.20), (12.45, 11.15), (8.55, 11.15)],
}

OUTER_WALL = [
    (0.05, 0.05), (10.80, 0.05), (10.80, 1.25), (12.45, 1.25),
    (12.45, 10.15), (12.45, 10.20), (12.45, 11.15), (8.55, 11.15),
    (8.55, 10.20), (0.05, 10.20),
]

INTERIOR_WALLS = [
    ((1.60, 0.05), (1.60, 4.00), [(0.90, 1.70)]),
    ((1.60, 4.00), (3.40, 4.00), [(0.95, 1.75)]),
    ((3.40, 4.05), (3.40, 9.60), [(0.65, 1.45)]),
    ((3.45, 4.05), (6.25, 4.05), [(1.20, 2.00)]),
    ((5.80, 0.05), (5.80, 3.65), [(1.00, 1.80)]),
    ((5.95, 0.05), (5.95, 3.65), [(0.90, 1.70)]),
    ((5.95, 3.65), (8.05, 3.65), [(0.70, 1.50)]),
    ((8.05, 0.05), (8.05, 3.65), []),
    ((6.25, 4.05), (6.25, 9.60), [(0.55, 1.35)]),
    ((3.45, 9.60), (6.25, 9.60), []),
]

WINDOWS = [
    ((2.10, 0.05), (5.50, 0.05), 0.15, 3.10),
    ((10.80, 0.05), (10.80, 1.25), 0.10, 1.05),
    ((0.05, 4.30), (0.05, 9.45), 0.25, 4.70),
    ((0.05, 10.20), (3.40, 10.20), 0.20, 3.10),
    ((3.45, 10.20), (6.25, 10.20), 0.20, 2.60),
    ((8.55, 11.15), (12.45, 11.15), 0.20, 3.50),
    ((12.45, 4.00), (12.45, 9.60), 0.20, 5.20),
]
WINDOW_SILL = 0.34
WINDOW_HEAD = 1.02


def build_floors(m: Model) -> None:
    for name, points in ROOM_POLYGONS.items():
        m.poly_slab("floor_tile" if name in {"主卫", "卫生间", "阳台"} else "floor_wood", points)
    m.slab("plinth", -0.26, -0.26, 12.76, 11.46, y0=-FLOOR_T, thickness=PLINTH_T)


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
        (2.55, 4.00, 0), (3.35, 4.00, 0),
        (4.65, 4.05, 0), (5.45, 4.05, 0),
        (3.40, 4.70, math.pi / 2), (3.40, 5.50, math.pi / 2),
        (6.25, 4.60, math.pi / 2), (6.25, 5.40, math.pi / 2),
        (1.60, 0.95, math.pi / 2), (1.60, 1.75, math.pi / 2),
        (5.95, 0.95, math.pi / 2), (5.95, 1.75, math.pi / 2),
        (6.65, 3.65, 0), (7.45, 3.65, 0),
    ]
    for x, z, rot in jambs:
        m.box("wood_light", x, WALL_H / 2, z, 0.07, WALL_H, WALL_T + 0.02, rot)


def build_doors(m: Model) -> None:
    """开着的门扇，给剖切模型一点生活感。"""
    leaves = [
        (2.95, 4.00, 0.82, 0),
        (5.05, 4.05, 0.82, 0),
        (3.40, 5.10, 0.82, math.pi / 2),
        (6.25, 5.00, 0.82, math.pi / 2),
        (1.60, 1.35, 0.82, math.pi / 2),
        (5.95, 1.35, 0.82, math.pi / 2),
        (7.05, 3.65, 0.82, 0),
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


def open_wardrobe(m: Model, x, z, w, d, h=1.08) -> None:
    frame = 0.05
    for px in (x - w / 2 + frame / 2, x + w / 2 - frame / 2):
        m.box("metal_dark", px, h / 2, z, frame, h, d)
    m.box("metal_dark", x, h - frame / 2, z, w, frame, d)
    m.box("glass_tint", x, h / 2, z - d / 2, w - 0.08, h - 0.08, 0.025)


def bay_cabinet(m: Model, x, z, w, d=0.48) -> None:
    m.box("wood_dark", x, 0.38, z, w, 0.76, d)
    for i in range(1, 4):
        m.box("wood_light", x - w / 2 + w * i / 4, 0.38, z - d / 2 - 0.01, 0.025, 0.62, 0.03)


def counter(m: Model, x0, z0, x1, z1, h=0.86) -> None:
    m.box("white", (x0 + x1) / 2, h / 2 - 0.02, (z0 + z1) / 2, x1 - x0, h - 0.04, z1 - z0)
    m.box("stone", (x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 0.03, 0.05, z1 - z0 + 0.03)


def furniture(m: Model) -> None:
    rug(m, 8.80, 6.20, 11.65, 8.85)
    sofa(m, 10.10, 8.20, 3.00, 0.96)
    table(m, 10.10, 7.00, 1.15, 0.68, 0.36)
    m.box("screen", 7.05, 0.86, 7.30, 1.55, 0.88, 0.05)
    m.box("wood_dark", 7.05, 0.25, 7.30, 2.00, 0.36, 0.42)
    m.box("metal_dark", 7.05, 0.45, 7.30, 0.30, 0.10, 0.16)
    plant(m, 12.00, 9.55, 0.55)

    counter(m, 9.05, 0.40, 10.65, 0.98)
    counter(m, 11.90, 0.40, 12.22, 4.10)
    m.box("island", 8.55, 0.48, 3.05, 1.60, 0.90, 0.72)
    m.box("stone", 8.55, 0.96, 3.05, 1.72, 0.05, 0.78)
    m.box("metal", 9.42, 0.92, 0.70, 0.48, 0.04, 0.42)
    m.box("metal_dark", 12.02, 0.90, 1.75, 0.52, 0.06, 0.48)
    m.box("white", 11.32, 0.88, 0.95, 0.60, 1.72, 0.62)
    m.box("metal", 11.32, 0.92, 0.95, 0.02, 1.54, 0.58)

    table(m, 9.05, 4.35, 1.70, 0.86, 0.40)
    for dx in (-0.58, 0.58):
        chair(m, 9.05 + dx, 3.72)
        chair(m, 9.05 + dx, 4.98, math.pi)
    m.box("wood_dark", 7.15, 0.34, 4.85, 0.72, 0.58, 1.35)
    m.box("wood_light", 7.15, 0.70, 4.85, 0.76, 0.04, 1.40)

    m.box("wood_dark", 7.15, 0.50, 5.95, 1.60, 0.92, 0.38)
    m.box("wood_light", 7.15, 1.00, 5.95, 1.64, 0.04, 0.42)
    m.box("art", 6.55, 0.80, 5.35, 0.62, 0.46, 0.03)
    bay_cabinet(m, 1.70, 9.78, 2.75, 0.48)

    bed(m, 1.70, 6.55, 1.78, 2.20)
    wardrobe(m, 2.98, 5.00, 0.48, 1.70)
    wardrobe(m, 1.15, 4.48, 1.65, 0.48)
    open_wardrobe(m, 2.92, 8.10, 0.52, 1.40)
    m.box("wood_light", 1.65, 0.83, 9.45, 1.30, 0.04, 0.46)
    m.box("metal", 1.65, 0.86, 9.45, 0.08, 0.06, 0.40)
    rug(m, 0.48, 5.05, 2.70, 8.20)

    bed(m, 4.85, 7.45, 1.58, 2.02)
    table(m, 3.75, 6.25, 0.48, 0.48, 0.48)
    chair(m, 3.75, 6.85, math.pi)
    wardrobe(m, 5.90, 5.00, 0.48, 1.45)
    bay_cabinet(m, 4.85, 9.78, 2.35, 0.48)
    rug(m, 3.60, 6.20, 5.95, 9.05)

    open_wardrobe(m, 3.70, 2.15, 2.20, 0.42)
    wardrobe(m, 2.08, 2.35, 0.48, 2.05)
    wardrobe(m, 5.32, 2.35, 0.48, 2.05)
    m.box("glass_tint", 3.70, 0.62, 4.02, 1.15, 1.12, 0.04)

    m.box("white", 0.72, 0.22, 2.15, 0.48, 0.38, 0.42)
    m.cyl("ceramic", 1.22, 0.20, 3.15, 0.23, 0.40, 14)
    m.box("white", 6.45, 0.22, 2.35, 0.48, 0.38, 0.42)
    m.cyl("ceramic", 7.35, 0.20, 2.35, 0.23, 0.40, 14)
    m.box("white", 7.62, 0.30, 3.10, 0.44, 0.56, 0.48)
    m.box("art", 6.35, 0.78, 3.35, 0.52, 0.44, 0.03)

    m.box("ceramic", 10.75, 0.43, 10.72, 0.22, 0.09, 0.22)
    m.cyl("wood_light", 12.00, 0.26, 10.72, 0.24, 0.52, 14)


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
