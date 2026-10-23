"""
Gera public/data/mapa-mocambique.json a partir dos limites do geoBoundaries
(OpenStreetMap, licença ODbL 1.0).

  ADM1 -> 10 províncias (a Cidade de Maputo vem incluída na Província de Maputo)
  ADM2 -> extraímos 'Cidade De Maputo' para termos as 11 unidades oficiais

Uso: python3 scripts/build-map.py <adm1.geojson> <adm2.geojson>
"""
import json
import math
import sys
import unicodedata
from pathlib import Path

SCALE = 42          # px por grau
TOLERANCE = 0.55    # simplificação Douglas-Peucker (px)
PAD = 6

NAMES = {
    "Niassa": ("niassa", "Niassa"),
    "Cabo Delgado": ("cabo-delgado", "Cabo Delgado"),
    "Nampula": ("nampula", "Nampula"),
    "Zambézia": ("zambezia", "Zambézia"),
    "Tete": ("tete", "Tete"),
    "Manica": ("manica", "Manica"),
    "Sofala": ("sofala", "Sofala"),
    "Inhambane": ("inhambane", "Inhambane"),
    "Gaza": ("gaza", "Gaza"),
    "Maputo": ("maputo-provincia", "Maputo Província"),
    "Cidade De Maputo": ("maputo-cidade", "Maputo Cidade"),
}


def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def perp_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0, None
        for i in range(s + 1, e):
            d = perp_dist(pts[i], pts[s], pts[e])
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(pts, keep) if k]


def main(adm1_path, adm2_path):
    adm1 = json.load(open(adm1_path))["features"]
    adm2 = json.load(open(adm2_path))["features"]
    feats = adm1 + [f for f in adm2 if f["properties"]["shapeName"] == "Cidade De Maputo"]

    all_pts = [pt for f in feats for poly in rings_of(f["geometry"]) for ring in poly for pt in ring]
    min_lon = min(p[0] for p in all_pts)
    max_lat = max(p[1] for p in all_pts)
    min_lat = min(p[1] for p in all_pts)
    k = math.cos(math.radians((max_lat + min_lat) / 2))

    def proj(lon, lat):
        return ((lon - min_lon) * k * SCALE + PAD, (max_lat - lat) * SCALE + PAD)

    out, max_x, max_y = [], 0, 0
    for f in feats:
        pid, label = NAMES[f["properties"]["shapeName"]]
        parts, big_area, cx, cy = [], 0, 0, 0
        for poly in rings_of(f["geometry"]):
            for ri, ring in enumerate(poly):
                pts = [proj(*p[:2]) for p in ring]
                tol = 0.05 if pid == "maputo-cidade" else TOLERANCE
                pts = simplify(pts, tol)
                if len(pts) < 3:
                    continue
                # descarta ilhotas minúsculas
                area = 0.5 * sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))
                if abs(area) < 0.8 and pid != "maputo-cidade":
                    continue
                if ri == 0 and abs(area) > big_area:
                    big_area = abs(area)
                    a6 = -6 * area
                    cx = sum((pts[i - 1][0] + pts[i][0]) * (pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1]) for i in range(len(pts))) / a6
                    cy = sum((pts[i - 1][1] + pts[i][1]) * (pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1]) for i in range(len(pts))) / a6
                for x, y in pts:
                    max_x, max_y = max(max_x, x), max(max_y, y)
                parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        out.append({"id": pid, "name": label, "d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1)})

    order = [v[0] for v in NAMES.values()]
    out.sort(key=lambda p: order.index(p["id"]))
    data = {
        "viewBox": f"0 0 {math.ceil(max_x + PAD)} {math.ceil(max_y + PAD)}",
        "source": "geoBoundaries (OpenStreetMap, ODbL 1.0)",
        "provinces": out,
    }
    dest = Path(__file__).resolve().parent.parent / "public" / "data" / "mapa-mocambique.json"
    dest.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{dest} · {dest.stat().st_size // 1024} KB · {len(out)} províncias · viewBox {data['viewBox']}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
