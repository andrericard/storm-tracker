import type { LatLon } from "#/lib/storm-types";

export const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceKm(a: LatLon, b: LatLon) {
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function bearingDeg(from: LatLon, to: LatLon) {
	const y = Math.sin(toRad(to.lon - from.lon)) * Math.cos(toRad(to.lat));
	const x =
		Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
		Math.sin(toRad(from.lat)) *
			Math.cos(toRad(to.lat)) *
			Math.cos(toRad(to.lon - from.lon));
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(
	from: LatLon,
	headingDeg: number,
	distance: number,
): LatLon {
	const d = distance / EARTH_RADIUS_KM;
	const heading = toRad(headingDeg);
	const lat1 = toRad(from.lat);
	const lon1 = toRad(from.lon);
	const lat2 = Math.asin(
		Math.sin(lat1) * Math.cos(d) +
			Math.cos(lat1) * Math.sin(d) * Math.cos(heading),
	);
	const lon2 =
		lon1 +
		Math.atan2(
			Math.sin(heading) * Math.sin(d) * Math.cos(lat1),
			Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
		);
	return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

export function toLocalKm(origin: LatLon, point: LatLon) {
	return {
		x:
			toRad(point.lon - origin.lon) *
			EARTH_RADIUS_KM *
			Math.cos(toRad(origin.lat)),
		y: toRad(point.lat - origin.lat) * EARTH_RADIUS_KM,
	};
}

export function circlePolygon(center: LatLon, radiusKm: number, steps = 96) {
	const ring: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const p = destination(center, (i / steps) * 360, radiusKm);
		ring.push([p.lon, p.lat]);
	}
	return ring;
}

const COMPASS = [
	"N",
	"NNE",
	"NE",
	"ENE",
	"E",
	"ESE",
	"SE",
	"SSE",
	"S",
	"SSW",
	"SW",
	"WSW",
	"W",
	"WNW",
	"NW",
	"NNW",
];

export function compass(deg: number, language: "pt" | "en" = "en") {
	const label = COMPASS[Math.round(deg / 22.5) % 16];
	return language === "pt" ? label.replaceAll("W", "O") : label;
}
