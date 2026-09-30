import { createFileRoute } from "@tanstack/react-router";
import { RADAR_BOUNDS } from "#/lib/radar";

const BASE_URL = "https://www.ipmetradar.com.br";
const HEADERS = {
	Referer: `${BASE_URL}/2satGis.php`,
	"User-Agent": "storm-tracker (personal weather dashboard)",
};
const FRAME_COUNT = 5;
const EARTH_RADIUS_M = 6378137;
const WIDTH_PX = 1420;
const LIST_TTL_MS = 60 * 1000;

function mercator(lon: number, lat: number) {
	return [
		(lon * Math.PI * EARTH_RADIUS_M) / 180,
		Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * EARTH_RADIUS_M,
	];
}

const [minX, minY] = mercator(RADAR_BOUNDS.west, RADAR_BOUNDS.south);
const [maxX, maxY] = mercator(RADAR_BOUNDS.east, RADAR_BOUNDS.north);
const WMS_PARAMS = new URLSearchParams({
	SERVICE: "WMS",
	VERSION: "1.1.1",
	REQUEST: "GetMap",
	LAYERS: "merged",
	STYLES: "",
	SRS: "EPSG:900913",
	BBOX: [minX, minY, maxX, maxY].join(","),
	WIDTH: String(WIDTH_PX),
	HEIGHT: String(Math.round((WIDTH_PX * (maxY - minY)) / (maxX - minX))),
	FORMAT: "image/png",
	TRANSPARENT: "true",
});

const suffix = (index: number) => (index ? String(index) : "");

async function frameTime(index: number) {
	const response = await fetch(
		`${BASE_URL}/alerta/dados/ppi/lastPPI${suffix(index)}.txt`,
		{ headers: HEADERS },
	);
	const match = (await response.text()).match(
		/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/,
	);
	if (!response.ok || !match)
		throw new Error(`IPMet frame ${index} has no timestamp`);
	const [, day, month, year, hour, minute] = match;
	return new Date(
		`${year}-${month}-${day}T${hour}:${minute}:00-03:00`,
	).toISOString();
}

let list: { at: number; times: string[] } | null = null;
const images = new Map<string, ArrayBuffer>();

async function frameTimes() {
	if (list && Date.now() - list.at < LIST_TTL_MS) return list.times;
	const times = await Promise.all(
		Array.from({ length: FRAME_COUNT }, (_, i) => frameTime(i)),
	);
	list = { at: Date.now(), times };
	for (const time of images.keys())
		if (!times.includes(time)) images.delete(time);
	return times;
}

async function frameImage(time: string) {
	const cached = images.get(time);
	if (cached) return cached;
	const index = (await frameTimes()).indexOf(time);
	if (index < 0) return null;
	const response = await fetch(
		`${BASE_URL}/cgi-bin/mapserv.cgi?map=/home/webadm/alerta/dados/ppi/last${suffix(index)}.map&${WMS_PARAMS}`,
		{ headers: HEADERS },
	);
	if (!response.ok || response.headers.get("content-type") !== "image/png")
		throw new Error(`IPMet responded ${response.status}`);
	const body = await response.arrayBuffer();
	if ((await frameTime(index)) !== time)
		throw new Error("IPMet rotated frames during download");
	images.set(time, body);
	return body;
}

export const Route = createFileRoute("/api/radar")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const time = new URL(request.url).searchParams.get("time");
				try {
					if (!time)
						return Response.json(await frameTimes(), {
							headers: { "Cache-Control": "public, max-age=60" },
						});
					const image = await frameImage(time);
					if (!image)
						return Response.json(
							{ error: "Radar frame expired" },
							{ status: 404 },
						);
					return new Response(image, {
						headers: {
							"Content-Type": "image/png",
							"Cache-Control": "public, max-age=31536000, immutable",
						},
					});
				} catch (error) {
					console.error(error);
					return Response.json(
						{ error: error instanceof Error ? error.message : "Unknown error" },
						{ status: 502 },
					);
				}
			},
		},
	},
});
