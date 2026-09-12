import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('plan', Path(__file__).parents[1] / 'model/build_model.py')
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)


class SurfaceTest(unittest.TestCase):
    def test_floor_winding_matches_normals(self):
        model = plan.Model()
        plan.build_floors(model)
        for group in model.groups.values():
            for i in range(0, len(group.idx), 3):
                indices = group.idx[i:i+3]
                a, b, c = [group.pos[k*3:k*3+3] for k in indices]
                u, v = [b[k]-a[k] for k in range(3)], [c[k]-a[k] for k in range(3)]
                cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                normal = group.nrm[indices[0]*3:indices[0]*3+3]
                self.assertGreater(sum(x*y for x,y in zip(cross,normal)), 0)

    def test_room_floors_do_not_overlap(self):
        def inside(x, z, points):
            hit = False
            for i, (ax, az) in enumerate(points):
                bx, bz = points[(i+1) % len(points)]
                if (az > z) != (bz > z) and x < ax + (z-az)*(bx-ax)/(bz-az):
                    hit = not hit
            return hit
        # Intersect every cell induced by the real polygon coordinates. Unlike
        # fixed grid sampling, this catches even the previous 50 mm overlap.
        xs = sorted({x for points in plan.ROOM_POLYGONS.values() for x,z in points})
        zs = sorted({z for points in plan.ROOM_POLYGONS.values() for x,z in points})
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(zs,zs[1:]):
                x,z=(a+b)/2,(c+d)/2
                rooms=[name for name,points in plan.ROOM_POLYGONS.items() if inside(x,z,points)]
                self.assertLessEqual(len(rooms),1,(x,z,rooms))


if __name__ == '__main__':
    unittest.main()
