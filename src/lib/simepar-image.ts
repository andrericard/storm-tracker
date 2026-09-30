import type { FieldImage } from "#/lib/field-image";
import {
	latFromMercatorY,
	type MercatorCorners,
	mercatorY,
} from "#/lib/mercator-grid";

export const SIMEPAR_BOUNDS = {
	west: -57.1419,
	east: -45.8144,
	north: -21.0058,
	south: -28.5076,
};

const MASKED_REGIONS: [number, number, number, number][] = [
	[0, 0, 340, 60],
	[0, 605, 310, 672],
	[625, 595, 980, 672],
];
const FILL_RADIUS = 5;
const FILL_MIN_FRACTION = 0.4;

function isRadarColor(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (max < 128) return false;
	const saturation = (max - min) / max;
	if (saturation < 0.5) return false;
	const delta = max - min || 1;
	let hue: number;
	if (max === r) hue = ((60 * (g - b)) / delta + 360) % 360;
	else if (max === g) hue = (60 * (b - r)) / delta + 120;
	else hue = (60 * (r - g)) / delta + 240;
	if (hue <= 75) return true;
	if (hue <= 150) return max >= 140;
	return hue >= 270 && hue <= 345;
}

function keyRadar(image: ImageData) {
	const { width, height, data } = image;
	const keep = new Uint8Array(width * height);
	for (let p = 0; p < keep.length; p++) {
		keep[p] = isRadarColor(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])
			? 1
			: 0;
	}
	for (const [x0, y0, x1, y1] of MASKED_REGIONS) {
		for (let y = y0; y < Math.min(y1, height); y++) {
			for (let x = x0; x < Math.min(x1, width); x++) keep[y * width + x] = 0;
		}
	}
	const output = new Uint8ClampedArray(data.length);
	const window = (2 * FILL_RADIUS + 1) ** 2;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = y * width + x;
			if (keep[p]) {
				output.set(data.subarray(p * 4, p * 4 + 3), p * 4);
				output[p * 4 + 3] = 255;
				continue;
			}
			let count = 0;
			let r = 0;
			let g = 0;
			let b = 0;
			for (let dy = -FILL_RADIUS; dy <= FILL_RADIUS; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= height) continue;
				for (let dx = -FILL_RADIUS; dx <= FILL_RADIUS; dx++) {
					const xx = x + dx;
					if (xx < 0 || xx >= width) continue;
					const q = yy * width + xx;
					if (!keep[q]) continue;
					count++;
					r += data[q * 4];
					g += data[q * 4 + 1];
					b += data[q * 4 + 2];
				}
			}
			if (count / window >= FILL_MIN_FRACTION) {
				output[p * 4] = r / count;
				output[p * 4 + 1] = g / count;
				output[p * 4 + 2] = b / count;
				output[p * 4 + 3] = 255;
			}
		}
	}
	return new ImageData(output, width, height);
}

function toMercatorRows(keyed: ImageData) {
	const { width, height } = keyed;
	const output = new Uint8ClampedArray(keyed.data.length);
	const yNorth = mercatorY(SIMEPAR_BOUNDS.north);
	const ySouth = mercatorY(SIMEPAR_BOUNDS.south);
	const latSpan = SIMEPAR_BOUNDS.north - SIMEPAR_BOUNDS.south;
	for (let j = 0; j < height; j++) {
		const lat = latFromMercatorY(
			yNorth + ((j + 0.5) / height) * (ySouth - yNorth),
		);
		const sourceRow = Math.min(
			height - 1,
			Math.max(
				0,
				Math.floor(((SIMEPAR_BOUNDS.north - lat) / latSpan) * height),
			),
		);
		output.set(
			keyed.data.subarray(sourceRow * width * 4, (sourceRow + 1) * width * 4),
			j * width * 4,
		);
	}
	return new ImageData(output, width, height);
}

export const SIMEPAR_CORNERS: MercatorCorners = [
	[SIMEPAR_BOUNDS.west, SIMEPAR_BOUNDS.north],
	[SIMEPAR_BOUNDS.east, SIMEPAR_BOUNDS.north],
	[SIMEPAR_BOUNDS.east, SIMEPAR_BOUNDS.south],
	[SIMEPAR_BOUNDS.west, SIMEPAR_BOUNDS.south],
];

export async function loadSimeparImage(
	signal?: AbortSignal,
): Promise<FieldImage> {
	const response = await fetch(`/api/simepar?t=${Date.now()}`, { signal });
	if (!response.ok) throw new Error("Simepar radar is not available");
	const bitmap = await createImageBitmap(await response.blob());
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas not available");
	context.drawImage(bitmap, 0, 0);
	bitmap.close();
	const source = context.getImageData(0, 0, canvas.width, canvas.height);
	context.putImageData(toMercatorRows(keyRadar(source)), 0, 0);
	return { url: canvas.toDataURL(), corners: SIMEPAR_CORNERS };
}
