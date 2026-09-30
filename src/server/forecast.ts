import type { ForecastHour, PointForecast } from "#/lib/storm-types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const HOURS_AHEAD = 36;
const USER_AGENT = "storm-tracker (personal weather dashboard)";
const MONTHS = [
	"jan",
	"fev",
	"mar",
	"abr",
	"mai",
	"jun",
	"jul",
	"ago",
	"set",
	"out",
	"nov",
	"dez",
];

interface Place {
	name: string;
	paranaCode: string | null;
}

interface SimeparHour {
	time: string;
	condition: string;
	rainMm: number;
	rainChance: number;
}

interface EcmwfHour {
	time: string;
	rainMm: number;
	rainChance: number;
}

const placeCache = new Map<string, Place>();
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
	const value = await load();
	cache.set(key, { at: Date.now(), value });
	return value;
}

async function reversePlace(lat: number, lon: number): Promise<Place> {
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	const hit = placeCache.get(key);
	if (hit) return hit;
	const params = new URLSearchParams({
		lat: String(lat),
		lon: String(lon),
		zoom: "10",
		format: "jsonv2",
		extratags: "1",
	});
	const response = await fetch(
		`https://nominatim.openstreetmap.org/reverse?${params}`,
		{ headers: { "User-Agent": USER_AGENT } },
	);
	if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
	const found = await response.json();
	const place = {
		name: found.name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
		paranaCode:
			found.address?.["ISO3166-2-lvl4"] === "BR-PR"
				? (found.extratags?.["IBGE:GEOCODIGO"] ?? null)
				: null,
	};
	placeCache.set(key, place);
	return place;
}

function text(html: string, pattern: RegExp) {
	return (
		html
			.match(pattern)?.[1]
			?.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim() ?? ""
	);
}

function simeparDate(day: string) {
	const match = day.match(/(\d{2}) de (\w{3}) de (\d{4})/);
	if (!match) return "";
	const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
	return `${match[3]}-${String(month).padStart(2, "0")}-${match[1]}`;
}

export function parseSimepar(html: string) {
	const hours: SimeparHour[] = html
		.split('class = "table-hourly')
		.slice(1)
		.flatMap((section) => {
			const date = simeparDate(text(section, /class="did-data">([^<]*)</));
			return section
				.split('class="ah-header"')
				.slice(1)
				.map((row) => ({
					time: `${date}T${text(row, /class="ah-time">([^<]*)</)}`,
					condition: text(row, /class="ah-temp"><i[^>]*title="([^"]*)"/),
					rainMm: Number(text(row, /class="ah-prec">([\d.]+)/) || 0),
					rainChance: Number(
						text(
							row,
							/Probabilidade de Ocorr[^:]*:<\/span>\s*<span[^>]*>\s*(\d+)/,
						) || 0,
					),
				}));
		});
	return { city: text(html, /<h2>\s*<a[^>]*>([^<]*)</), hours };
}

function loadSimepar(code: string) {
	return cached(`simepar:${code}`, async () => {
		const url = `https://www.simepar.br/simepar/forecast_by_counties/${code}`;
		const response = await fetch(url, {
			headers: { "User-Agent": USER_AGENT },
		});
		if (!response.ok) throw new Error(`Simepar responded ${response.status}`);
		return { url, ...parseSimepar(await response.text()) };
	});
}

function loadEcmwf(lat: number, lon: number) {
	return cached(`ecmwf:${lat.toFixed(3)},${lon.toFixed(3)}`, async () => {
		const params = new URLSearchParams({
			latitude: String(lat),
			longitude: String(lon),
			hourly: "precipitation,precipitation_probability",
			models: "ecmwf_ifs",
			timezone: "auto",
			forecast_days: "3",
		});
		const response = await fetch(
			`https://api.open-meteo.com/v1/forecast?${params}`,
		);
		if (!response.ok)
			throw new Error(`Open-Meteo responded ${response.status}`);
		const { hourly, utc_offset_seconds } = await response.json();
		const hours: EcmwfHour[] = hourly.time.map((time: string, i: number) => ({
			time,
			rainMm: hourly.precipitation[i] ?? 0,
			rainChance: hourly.precipitation_probability[i] ?? 0,
		}));
		return { hours, utcOffsetSeconds: utc_offset_seconds as number };
	});
}

function localHour(utcOffsetSeconds: number, offsetHours = 0) {
	const date = new Date(
		Date.now() + utcOffsetSeconds * 1000 + offsetHours * 3600 * 1000,
	);
	return `${date.toISOString().slice(0, 13)}:00`;
}

export function mergeForecasts(
	simepar: SimeparHour[],
	ecmwf: EcmwfHour[],
	from: string,
	to: string,
): ForecastHour[] {
	const rows = new Map<string, ForecastHour>();
	for (const hour of ecmwf) {
		if (hour.time < from || hour.time > to) continue;
		rows.set(hour.time, {
			time: hour.time,
			condition: null,
			simepar: null,
			ecmwf: { rainMm: hour.rainMm, rainChance: hour.rainChance },
		});
	}
	for (const hour of simepar) {
		if (hour.time < from || hour.time > to) continue;
		rows.set(hour.time, {
			time: hour.time,
			ecmwf: null,
			...rows.get(hour.time),
			condition: hour.condition,
			simepar: { rainMm: hour.rainMm, rainChance: hour.rainChance },
		});
	}
	return [...rows.values()].sort((a, b) => a.time.localeCompare(b.time));
}

async function settle<T>(promise: Promise<T> | null) {
	try {
		return await promise;
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function loadForecast(
	lat: number,
	lon: number,
): Promise<PointForecast> {
	const place = await settle(reversePlace(lat, lon));
	const [simepar, ecmwf] = await Promise.all([
		settle(place?.paranaCode ? loadSimepar(place.paranaCode) : null),
		settle(loadEcmwf(lat, lon)),
	]);
	if (!simepar && !ecmwf) throw new Error("No forecast source responded");
	const offset = ecmwf?.utcOffsetSeconds ?? -3 * 3600;
	return {
		city:
			simepar?.city ?? place?.name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
		simeparUrl: simepar?.url ?? null,
		hours: mergeForecasts(
			simepar?.hours ?? [],
			ecmwf?.hours ?? [],
			localHour(offset),
			localHour(offset, HOURS_AHEAD),
		),
	};
}
