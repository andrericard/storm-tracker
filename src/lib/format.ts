import { compass } from "#/lib/geo";
import { type Language, translate } from "#/lib/i18n";
import { ALERT_RADIUS_KM } from "#/lib/map-data";
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

export function formatAge(
	iso: string,
	language: Language = "pt",
	now = Date.now(),
) {
	const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
	return minutes <= 0
		? translate(language, "just now")
		: translate(language, "{time} ago", { time: formatMinutes(minutes) });
}

export const STATUS_LABELS: Record<ThreatStatus, string> = {
	uncertain: "Uncertain motion",
	overhead: "Over target",
	approaching: "Approaching",
	passing: "Passing nearby",
	stationary: "Stationary",
	distant: "Not heading here",
};

export function headline(tracks: TrackSummary[], language: Language = "pt") {
	const t = (text: string, values?: Record<string, string | number>) =>
		translate(language, text, values);
	const track = tracks.find((track) => track.distanceKm <= ALERT_RADIUS_KM);
	if (!track) {
		return {
			tone: "calm" as const,
			title: t("No convective storms"),
			detail: t("Nothing with cloud tops below -38°C within {radius} km.", {
				radius: ALERT_RADIUS_KM,
			}),
		};
	}
	const where = `${track.distanceKm} km ${compass(track.bearingFromTargetDeg, language)}`;
	switch (track.status) {
		case "uncertain":
			return {
				tone: "watch" as const,
				title: t("Uncertain motion"),
				detail: t("Not enough consistent cloud motion to estimate arrival."),
			};
		case "overhead":
			return {
				tone: "alert" as const,
				title: t("Storm #{id} is over you", { id: track.trackId }),
				detail: t("Tops at {temp}°C, {flashes} flashes in the last 10 min.", {
					temp: Math.round(track.minBrightnessTempK - 273.15),
					flashes: track.flashCount,
				}),
			};
		case "approaching":
			return {
				tone: "alert" as const,
				title: t("Storm #{id} arriving in ~{time}", {
					id: track.trackId,
					time: formatMinutes(track.etaMinutes ?? 0),
				}),
				detail: t("Currently {where}, moving {direction} at {speed} km/h.", {
					where,
					direction: compass(track.headingDeg, language),
					speed: track.speedKmh,
				}),
			};
		case "passing":
			return {
				tone: "watch" as const,
				title: t("Storm #{id} may pass nearby", { id: track.trackId }),
				detail: t("Closest approach ~{distance} km in {time}.", {
					distance: track.closestApproachKm,
					time: formatMinutes(track.closestApproachMinutes),
				}),
			};
		default:
			return {
				tone: "calm" as const,
				title: t("No storms heading your way"),
				detail: t("Nearest active cell is {where}.", { where }),
			};
	}
}
