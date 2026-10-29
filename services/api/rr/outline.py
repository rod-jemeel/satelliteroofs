"""Validate user-entered geographic outlines; spherical horizontal area only."""
from math import isfinite, radians, sin


def spherical_area_ft2(ring):
    points=list(ring)[:-1]
    n=len(points)
    total=sum(radians(points[(i+1)%n][0]-points[(i-1)%n][0])*sin(radians(points[i][1])) for i in range(n))
    return abs(total)*6371008.8**2/2*10.76391041671 if n>=3 else 0


def outline_area_ft2(ring,minimum=100):
    if not 4 <= len(ring) <= 501 or ring[0] != ring[-1]:
        raise ValueError('Close the outline with 3–500 distinct corners.')
    points = ring[:-1]
    if any(not isfinite(x) or not isfinite(y) or abs(x)>180 or abs(y)>85 for x,y in points):
        raise ValueError('Outline coordinates are invalid.')
    if len(set(points)) != len(points):
        raise ValueError('Outline corners must be distinct.')
    if max(p[0] for p in points)-min(p[0] for p in points)>.05 or max(p[1] for p in points)-min(p[1] for p in points)>.05:
        raise ValueError('This outline is too large for a residential roof scenario.')
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(a,b,c):return abs(cross(a,b,c))<1e-16 and min(a[0],b[0])-1e-12<=c[0]<=max(a[0],b[0])+1e-12 and min(a[1],b[1])-1e-12<=c[1]<=max(a[1],b[1])+1e-12
    n=len(points)
    for i in range(n):
        a,b=points[i],points[(i+1)%n]
        for j in range(i+1,n):
            if j==i+1 or (i==0 and j==n-1):continue
            c,d=points[j],points[(j+1)%n]
            if (cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0) or on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b):
                raise ValueError('Outline edges cross or touch. Move the corners before saving.')
    # Spherical polygon area, with the same mean-earth radius used by Turf.
    area=spherical_area_ft2(ring)
    if not minimum<=area<=25000:raise ValueError(f'The outline must cover {minimum}–25,000 ft².')
    return area
