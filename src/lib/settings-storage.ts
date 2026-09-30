import type { MapSettings } from "#/components/storm-map";

const STORAGE_KEY = "storm-tracker:settings";

export const DEFAULT_SETTINGS: MapSettings = {
	view: "2d",
	clouds: true,
	lowClouds: false,
	opacity: 0.8,
	lightning: true,
	tracks: true,
	rain: false,
	radar: false,
	overlay: "none",
	exaggeration: 5,
};

const VIEWS = new Set(["2d", "3d"]);
const OVERLAYS = new Set(["none", "mslp", "cape", "shear6", "srh3"]);

function clampNumber(
	value: unknown,
	min: number,
	max: number,
	fallback: number,
) {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;
}

function bool(value: unknown, fallback: boolean) {
	return typeof value === "boolean" ? value : fallback;
}

export function loadSettings(): MapSettings {
	if (typeof window === "undefined") return DEFAULT_SETTINGS;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<
			Record<keyof MapSettings, unknown>
		>;
		return {
			view: VIEWS.has(parsed.view as string)
				? (parsed.view as MapSettings["view"])
				: DEFAULT_SETTINGS.view,
			clouds: bool(parsed.clouds, DEFAULT_SETTINGS.clouds),
			lowClouds: bool(parsed.lowClouds, DEFAULT_SETTINGS.lowClouds),
			opacity: clampNumber(parsed.opacity, 0.1, 1, DEFAULT_SETTINGS.opacity),
			lightning: bool(parsed.lightning, DEFAULT_SETTINGS.lightning),
			tracks: bool(parsed.tracks, DEFAULT_SETTINGS.tracks),
			rain: bool(parsed.rain, DEFAULT_SETTINGS.rain),
			radar: bool(parsed.radar, DEFAULT_SETTINGS.radar),
			overlay: OVERLAYS.has(parsed.overlay as string)
				? (parsed.overlay as MapSettings["overlay"])
				: DEFAULT_SETTINGS.overlay,
			exaggeration: clampNumber(
				parsed.exaggeration,
				1,
				20,
				DEFAULT_SETTINGS.exaggeration,
			),
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(settings: MapSettings) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		return;
	}
}
