# Storm Tracker

Real-time convective storm tracker built on NOAA GOES-19 open data. Cloud tops are rendered in 3D over a MapLibre map, storms are detected and tracked across scans, and each cell gets a motion vector, forecast path and ETA to the selected location (default: Umuarama, PR).

## Stack

- TanStack Start (SPA mode, no SSR) + TanStack Router + TanStack Query
- shadcn/ui + Tailwind CSS v4
- MapLibre GL (3D `fill-extrusion` for cloud tops)
- h5wasm to read GOES NetCDF4 files on the server

## Data sources

All data is read directly from the public `noaa-goes19` bucket on AWS (no API key):

| Product | Use |
| --- | --- |
| `ABI-L2-CMIPF` band 13 (10.3 µm) | Cloud top brightness temperature, storm detection |
| `ABI-L2-ACHAF` | Cloud top height (3D extrusion height) |
| `GLM-L2-LCFA` | Lightning flashes |

Files are cached in the OS temp folder (`storm-tracker-cache`) for 4 hours.

## How it works

1. The last 6 full-disk scans (10 min apart) are cropped to a 400 km radius around the target and binned to a 0.05° grid.
2. Storms are segmented with multiple brightness temperature thresholds (235 K down to 195 K) so large systems are split into their convective cores.
3. Cores are matched frame to frame by overlap, then by distance, to build tracks.
4. Motion is a least-squares fit over the last positions; new cells borrow motion from nearby tracked cells.
5. Closest approach and ETA to the target are computed from the motion vector.

## Running

Requires Node 24 (`nvm use 24`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first request downloads ~150 MB from NOAA and can take up to a minute; later refreshes reuse the cache.

## API

`GET /api/frames?lat=-23.7661&lon=-53.3206&frames=6&radius=400`
