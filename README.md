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

1. The last 12 full-disk scans (10 min apart) are cropped to a 400 km radius around the target and binned to a 0.05° grid.
2. Storms are segmented with multiple brightness temperature thresholds (235 K down to 195 K) so large systems are split into their convective cores.
3. Cores are matched using motion-compensated overlap, area and distance. IDs are retained across overlapping requests in a bounded in-memory cache. IDs reset on server restarts or cache eviction; deployments with independent workers do not share identities.
4. Motion uses normalized cross-correlation of local temperature matrices 10 to 20 minutes apart, with coverage, texture, correlation and ambiguity checks. The last six valid-window measurements (up to 50 minutes) are combined with outlier rejection and modest recency weighting. Centroid changes no longer set the velocity. One missing estimate is tolerated; two missing scans or insufficient history hide the forecast and mark motion uncertain.
5. Closest approach and ETA use the motion vector and an equivalent-area cloud radius. The dashed line is a constant-motion extrapolation out to 180 minutes, not a prediction of storm growth or decay. Skill at that range is unverified.
6. Satellite severe-weather signals per cell: lightning jump (sudden rise in GLM flash rate) and overshooting top (minimum brightness temperature much colder than the surrounding anvil).
7. Storm environment per cell from GFS: LCL height, 0–6 km bulk shear, storm-relative helicity computed with the cell's own tracked motion, and a significant-tornado-parameter style index (CAPE × LCL × SRH × shear). In the Southern Hemisphere SRH is negative for favourable environments; the index uses its magnitude.

The map can overlay 2D fields from GFS (sea level pressure with isobars, CAPE, 0–6 km shear, |SRH| 0–3 km) and the GOES rainfall rate.

### Hourly forecast

`/api/forecast` merges two hourly point forecasts for the selected location by local hour, for the next 36 hours. The ECMWF IFS 9 km forecast comes from Open-Meteo (CC-BY 4.0, rain probability from the ECMWF ensemble) and works anywhere. The Simepar county forecast is scraped from `forecast_by_counties/<IBGE code>` when the location is in Paraná, with the IBGE code taken from the OpenStreetMap reverse geocode. Either source may fail without hiding the other. The card shows only rain, amount and chance per source; rows where both give 70% or more are highlighted.

### IPMet radar

The radar layer is the IPMet/Unesp PPI mosaic (Bauru and Presidente Prudente radars), requested from their MapServer WMS as a transparent PNG already in Web Mercator (`EPSG:900913`) over the layer's own bounds (lon -55.876 to -44.516, lat -26.4 to -18.08). It is proxied through `/api/radar` because the server only answers requests with an IPMet referer. IPMet keeps only the last five scans (about 30 minutes, `last.map` to `last4.map` with their times in `lastPPI*.txt`); `/api/radar` lists their times and serves each one by time, and the timeline shows the scan closest to the selected frame (within 8 minutes, the live frame always shows the newest scan). The WMS and WCS only expose the coloured palette, not raw dBZ values.

### Simepar radar

The Paraná state radar mosaic published by Simepar (`radar_msc`) is a plain JPEG with a baked-in basemap and no georeferencing. It was georeferenced once by detecting the 26 city markers in the image and fitting them to known coordinates: the image is an axis-aligned lat/lon box (lon −57.1419 to −45.8144, lat −28.5076 to −21.0058) with a 0.85 px RMS residual (about 1 km). At runtime the image is proxied through `/api/simepar`, the radar colours are keyed out from the basemap, labels are filled in from neighbouring echoes, rows are resampled to Web Mercator and the result is placed on the map with those bounds. The faintest (dark green) echoes are indistinguishable from vegetation in the basemap and are dropped.

## Running

Requires Node 24 (`nvm use 24`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first request downloads ~150 MB from NOAA and can take up to a minute; later refreshes reuse the cache.

## Deploying

The app needs a Node runtime for the `/api/frames` route, so it cannot run on static hosts such as GitHub Pages. It is set up for Vercel through the Nitro Vite plugin: import the repository at https://vercel.com/new and deploy with the defaults (`npm run build`, Node 24). The first request after a cold start downloads ~150 MB from NOAA and can take up to a minute; later requests reuse the cache in `/tmp`.

## API

`GET /api/frames?lat=-23.7661&lon=-53.3206&frames=6&radius=400`

## Interface and validation

Português and English are selectable in the layer panel; the choice is stored in the browser. The ruler adds map-anchored points with cumulative distance in km. Finish drawing to resume normal map clicks; Undo and Clear edit the line. Weather refreshes do not move or remove it. GFS fields and pressure contours are clipped to the same target radius as the clouds.

Run `npm test`, `npx tsc --noEmit` and `npm run build`. Synthetic regression checks cover translation despite cloud cooling, vector outliers, missing scans, identity continuity, glossary translations and circular clipping. These checks do not establish meteorological forecast accuracy; replaying observed cases is the next validation step.

### Why not use surface wind as the storm direction?

The existing GFS input already includes winds at multiple heights for shear and helicity. Surface winds alone are not the motion of a deep cloud system. GOES also publishes [Derived Motion Winds](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01518), tracking features across images and associating vectors with pressure levels. This update measures the existing infrared matrices directly; it does not ingest the DMW product or blend GFS winds into the trajectory. [Pysteps motion estimation](https://pysteps.readthedocs.io/en/stable/generated/pysteps.motion.lucaskanade.dense_lucaskanade.html) provides a reference for image-based tracking and outlier filtering; our implementation uses local correlation, not Lucas-Kanade.
