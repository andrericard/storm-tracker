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
| `ABI-L2-RRQPEF` | Satellite rainfall rate estimate (mm/h) |

Environment fields come from the GFS 0.25° model on the public `noaa-gfs-bdp-pds` bucket. Only the needed GRIB2 messages are fetched with HTTP range requests (using the `.idx` sidecar) and parsed with `@mattnucc/gribberish`: mean sea level pressure, CAPE, CIN, lifted index, 2 m temperature and dew point, and winds/heights at 10 m, 925, 850, 700 and 500 hPa.

Files are cached in the OS temp folder (`storm-tracker-cache`) for 4 hours.

## How it works

1. The last 6 full-disk scans (10 min apart) are cropped to a 400 km radius around the target and binned to a 0.05° grid.
2. Storms are segmented with multiple brightness temperature thresholds (235 K down to 195 K) so large systems are split into their convective cores.
3. Cores are matched frame to frame by overlap, then by distance, to build tracks.
4. Motion is a least-squares fit over the last positions; new cells borrow motion from nearby tracked cells.
5. Closest approach and ETA to the target are computed from the motion vector.
6. Satellite severe-weather signals per cell: lightning jump (sudden rise in GLM flash rate) and overshooting top (minimum brightness temperature much colder than the surrounding anvil).
7. Storm environment per cell from GFS: LCL height, 0–6 km bulk shear, storm-relative helicity computed with the cell's own tracked motion, and a significant-tornado-parameter style index (CAPE × LCL × SRH × shear). In the Southern Hemisphere SRH is negative for favourable environments; the index uses its magnitude.

The map can overlay 2D fields from GFS (sea level pressure with isobars, CAPE, 0–6 km shear, |SRH| 0–3 km) and the GOES rainfall rate.

## Running

Requires Node 24 (`nvm use 24`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first request downloads ~150 MB from NOAA and can take up to a minute; later refreshes reuse the cache.

## API

`GET /api/frames?lat=-23.7661&lon=-53.3206&frames=6&radius=400`
