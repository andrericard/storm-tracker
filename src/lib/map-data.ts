import type {
	Feature,
	FeatureCollection,
	LineString,
	Point,
	Polygon,
} from "geojson";
import { circlePolygon, destination } from "#/lib/geo";
import type {
	Frame,
	GridSpec,
	LatLon,
	Severity,
	TrackSummary,
} from "#/lib/storm-types";

export const SEVERITY_COLORS: Record<Severity, string> = {
	moderate: "#38bdf8",
	strong: "#facc15",
	severe: "#f97316",
	extreme: "#ef4444",
};

export const BRIGHTNESS_TEMP_STOPS: [number, string][] = [
	[185, "#f5d0fe"],
	[195, "#d946ef"],
	[202, "#dc2626"],
	[208, "#f97316"],
	[214, "#facc15"],
	[221, "#22c55e"],
	[228, "#0ea5e9"],
	[235, "#2563eb"],
	[245, "#94a3b8"],
	[258, "#cbd5e1"],
	[270, "#f1f5f9"],
];

export function cellsToGeoJSON(
	grid: GridSpec,
	frame: Frame,
): FeatureCollection<Polygon> {
	const features: Feature<Polygon>[] = [];
	const { index, brightnessTemp, height } = frame.cells;
	for (let i = 0; i < index.length; i++) {
		const row = Math.floor(index[i] / grid.cols);
		const col = index[i] % grid.cols;
		const west = grid.west + col * grid.step;
		const south = grid.south + row * grid.step;
		const east = west + grid.step;
		const north = south + grid.step;
		features.push({
			type: "Feature",
			properties: { bt: brightnessTemp[i] / 10, h: height[i] },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[west, south],
						[east, south],
						[east, north],
						[west, north],
						[west, south],
					],
				],
			},
		});
	}
	return { type: "FeatureCollection", features };
}

export function flashesToGeoJSON(frame: Frame): FeatureCollection<Point> {
	const features: Feature<Point>[] = [];
	for (let i = 0; i < frame.flashes.length; i += 2) {
		features.push({
			type: "Feature",
			properties: {},
			geometry: {
				type: "Point",
				coordinates: [frame.flashes[i], frame.flashes[i + 1]],
			},
		});
	}
	return { type: "FeatureCollection", features };
}

export function stormsToGeoJSON(frame: Frame): FeatureCollection {
	const features: Feature[] = [];
	for (const storm of frame.storms) {
		const properties = {
			trackId: storm.trackId,
			color: SEVERITY_COLORS[storm.severity],
			label: `#${storm.trackId} · ${Math.round(storm.minBrightnessTempK - 273.15)}°C`,
		};
		features.push({
			type: "Feature",
			properties,
			geometry: { type: "Polygon", coordinates: [storm.hull] },
		});
		features.push({
			type: "Feature",
			properties,
			geometry: { type: "Point", coordinates: [storm.lon, storm.lat] },
		});
	}
	return { type: "FeatureCollection", features };
}

const RELEVANT_STATUSES = new Set(["overhead", "approaching", "passing"]);

export function tracksToGeoJSON(
	tracks: TrackSummary[],
	selectedTrackId: number | null,
): FeatureCollection {
	const features: Feature<LineString | Point>[] = [];
	for (const track of tracks) {
		const color = SEVERITY_COLORS[track.severity];
		if (track.history.length >= 2) {
			features.push({
				type: "Feature",
				properties: { kind: "history", trackId: track.trackId, color },
				geometry: { type: "LineString", coordinates: track.history },
			});
		}
		const showForecast =
			track.trackId === selectedTrackId || RELEVANT_STATUSES.has(track.status);
		if (showForecast && track.forecast.length) {
			features.push({
				type: "Feature",
				properties: { kind: "forecast", trackId: track.trackId, color },
				geometry: {
					type: "LineString",
					coordinates: [
						[track.lon, track.lat],
						...track.forecast.map((p) => [p.lon, p.lat]),
					],
				},
			});
			for (const point of track.forecast) {
				if (point.minutes % 30 !== 0) continue;
				features.push({
					type: "Feature",
					properties: {
						kind: "tick",
						trackId: track.trackId,
						color,
						label: `${point.minutes}m`,
					},
					geometry: { type: "Point", coordinates: [point.lon, point.lat] },
				});
			}
		}
	}
	return { type: "FeatureCollection", features };
}

export const RANGE_RINGS_KM = [50, 100, 200, 300];

export function rangeRingsToGeoJSON(target: LatLon): FeatureCollection {
	const features: Feature[] = [];
	for (const radius of RANGE_RINGS_KM) {
		features.push({
			type: "Feature",
			properties: { label: `${radius} km` },
			geometry: {
				type: "LineString",
				coordinates: circlePolygon(target, radius),
			},
		});
		const labelPoint = destination(target, 0, radius);
		features.push({
			type: "Feature",
			properties: { label: `${radius} km` },
			geometry: {
				type: "Point",
				coordinates: [labelPoint.lon, labelPoint.lat],
			},
		});
	}
	return { type: "FeatureCollection", features };
}

export const EMPTY_COLLECTION: FeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

export function kelvinToCelsius(kelvin: number) {
	return Math.round(kelvin - 273.15);
}
