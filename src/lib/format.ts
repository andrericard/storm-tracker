import { compass } from "#/lib/geo";
import type { ThreatStatus, TrackSummary } from "#/lib/storm-types";

export function formatMinutes(minutes: number) {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(iso: string) {
	return new Date(iso).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatAge(iso: string, now = Date.now()) {
	const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
	return minutes <= 0 ? "just now" : `${formatMinutes(minutes)} ago`;
}

export const STATUS_LABELS: Record<ThreatStatus, string> = {
	overhead: "Over target",
	approaching: "Approaching",
	passing: "Passing nearby",
	stationary: "Stationary",
	distant: "Not heading here",
};

export function headline(track: TrackSummary | undefined, radiusKm: number) {
	if (!track) {
		return {
			tone: "calm" as const,
			title: "No convective storms",
			detail: `Nothing with cloud tops below -38°C within ${radiusKm} km.`,
		};
	}
	const where = `${track.distanceKm} km ${compass(track.bearingFromTargetDeg)}`;
	switch (track.status) {
		case "overhead":
			return {
				tone: "alert" as const,
				title: `Storm #${track.trackId} is over you`,
				detail: `Tops at ${Math.round(track.minBrightnessTempK - 273.15)}°C, ${track.flashCount} flashes in the last 10 min.`,
			};
		case "approaching":
			return {
				tone: "alert" as const,
				title: `Storm #${track.trackId} arriving in ~${formatMinutes(track.etaMinutes ?? 0)}`,
				detail: `Currently ${where}, moving ${compass(track.headingDeg)} at ${track.speedKmh} km/h.`,
			};
		case "passing":
			return {
				tone: "watch" as const,
				title: `Storm #${track.trackId} may pass nearby`,
				detail: `Closest approach ~${track.closestApproachKm} km in ${formatMinutes(track.closestApproachMinutes)}.`,
			};
		default:
			return {
				tone: "calm" as const,
				title: "No storms heading your way",
				detail: `Nearest active cell is ${where}.`,
			};
	}
}
