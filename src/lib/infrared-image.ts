import { BRIGHTNESS_TEMP_STOPS } from "#/lib/map-data";
import { type MercatorGrid, mercatorGrid } from "#/lib/mercator-grid";
import type { Frame, GridSpec } from "#/lib/storm-types";

export const TRANSPARENT_PIXEL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const STOPS = BRIGHTNESS_TEMP_STOPS.map(([k, hex]) => ({
	k,
	rgb: [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)),
}));

function colorFor(kelvin: number) {
	if (kelvin <= STOPS[0].k) return STOPS[0].rgb;
	for (let i = 1; i < STOPS.length; i++) {
		if (kelvin <= STOPS[i].k) {
			const a = STOPS[i - 1];
			const b = STOPS[i];
			const t = (kelvin - a.k) / (b.k - a.k);
			return a.rgb.map((v, c) => v + (b.rgb[c] - v) * t);
		}
	}
	return STOPS[STOPS.length - 1].rgb;
}

function alphaFor(kelvin: number) {
	if (kelvin < 235) return 0.88;
	if (kelvin < 250) return 0.88 - ((kelvin - 235) / 15) * 0.3;
	return 0.58 - ((kelvin - 250) / 20) * 0.4;
}

export interface InfraredImage {
	url: string;
	corners: MercatorGrid["corners"];
}

export function infraredImage(
	grid: GridSpec,
	frame: Frame,
	lowClouds: boolean,
	lowCloudLimitK: number,
): InfraredImage {
	const merc = mercatorGrid(grid, frame);
	const canvas = document.createElement("canvas");
	canvas.width = merc.width;
	canvas.height = merc.height;
	const context = canvas.getContext("2d");
	if (!context) return { url: TRANSPARENT_PIXEL, corners: merc.corners };
	const image = context.createImageData(merc.width, merc.height);
	for (let p = 0; p < merc.cellAt.length; p++) {
		const i = merc.cellAt[p];
		if (i < 0) continue;
		const kelvin = frame.cells.brightnessTemp[i] / 10;
		if (!lowClouds && kelvin >= lowCloudLimitK) continue;
		const [r, g, b] = colorFor(kelvin);
		image.data[p * 4] = r;
		image.data[p * 4 + 1] = g;
		image.data[p * 4 + 2] = b;
		image.data[p * 4 + 3] = Math.round(alphaFor(kelvin) * 255);
	}
	context.putImageData(image, 0, 0);
	return { url: canvas.toDataURL(), corners: merc.corners };
}
