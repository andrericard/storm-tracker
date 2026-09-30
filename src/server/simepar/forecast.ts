import type { SimeparForecast } from "#/lib/storm-types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const USER_AGENT = "storm-tracker (personal weather dashboard)";

const countyCache = new Map<string, string | null>();
const forecastCache = new Map<
	string,
	{ at: number; forecast: SimeparForecast }
>();

async function paranaCounty(lat: number, lon: number) {
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	if (countyCache.has(key)) return countyCache.get(key) ?? null;
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
	const place = await response.json();
	const code =
		place.address?.["ISO3166-2-lvl4"] === "BR-PR"
			? (place.extratags?.["IBGE:GEOCODIGO"] ?? null)
			: null;
	countyCache.set(key, code);
	return code;
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

export function parseForecast(html: string, url: string): SimeparForecast {
	const hours = html
		.split('class = "table-hourly')
		.slice(1)
		.flatMap((section) => {
			const day = text(section, /class="did-data">([^<]*)</);
			return section
				.split('class="ah-header"')
				.slice(1)
				.map((row) => ({
					day,
					time: text(row, /class="ah-time">([^<]*)</),
					condition: text(row, /class="ah-temp"><i[^>]*title="([^"]*)"/),
					tempC: Number(text(row, /class="ah-temp">.*?<\/i>\s*(-?\d+)/s)),
					rainMm: Number(text(row, /class="ah-prec">([\d.]+)/) || 0),
					rainChance: Number(
						text(
							row,
							/Probabilidade de Ocorr[^:]*:<\/span>\s*<span[^>]*>\s*(\d+)/,
						) || 0,
					),
					wind: text(row, /class="ah-wind">([^<]*)</),
				}));
		});
	return { city: text(html, /<h2>\s*<a[^>]*>([^<]*)</), url, hours };
}

export async function loadForecast(lat: number, lon: number) {
	const code = await paranaCounty(lat, lon);
	if (!code) return null;
	const cached = forecastCache.get(code);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.forecast;
	const url = `https://www.simepar.br/simepar/forecast_by_counties/${code}`;
	const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!response.ok) throw new Error(`Simepar responded ${response.status}`);
	const forecast = parseForecast(await response.text(), url);
	forecastCache.set(code, { at: Date.now(), forecast });
	return forecast;
}
