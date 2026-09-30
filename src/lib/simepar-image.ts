import { colorScale } from "#/lib/color-scale";
import type { FieldImage } from "#/lib/field-image";
import {
	latFromMercatorY,
	type MercatorCorners,
	mercatorY,
} from "#/lib/mercator-grid";

export const SIMEPAR_FRAME_COUNT = 8;

export type SimeparStyle = "raw" | "hd";

export const SIMEPAR_SCALE = colorScale([
	[0, "#02d504"],
	[0.21, "#003c00"],
	[0.26, "#f8f101"],
	[0.39, "#f0c501"],
	[0.47, "#e68101"],
	[0.54, "#f80002"],
	[0.67, "#a60000"],
	[0.72, "#ff9cfe"],
	[0.84, "#d421df"],
	[1, "#9e29d6"],
]);

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
const PALETTE_SIZE = 64;
const PALETTE_MAX_DISTANCE = 60;
const MIN_SATURATION = 0.7;
const PRESENCE_RADIUS = 1;
const VALUE_RADIUS = 0;
const MIN_PRESENCE = 0.4;
const HD_SCALE = 2;

const PALETTE = Array.from({ length: PALETTE_SIZE }, (_, i) => {
	const value = i / (PALETTE_SIZE - 1);
	const [r, g, b] = SIMEPAR_SCALE.rgba(value);
	return { value, r, g, b };
});

function paletteValue(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	if (max < 50 || (max - Math.min(r, g, b)) / max < MIN_SATURATION) return -1;
	let best = -1;
	let bestDistance = PALETTE_MAX_DISTANCE ** 2;
	for (const color of PALETTE) {
		const distance =
			(r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = color.value;
		}
	}
	return best;
}

function boxSum(
	grid: Float32Array,
	width: number,
	height: number,
	radius: number,
) {
	const stride = width + 1;
	const integral = new Float64Array(stride * (height + 1));
	for (let y = 0; y < height; y++) {
		let row = 0;
		for (let x = 0; x < width; x++) {
			row += grid[y * width + x];
			integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
		}
	}
	const output = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height, y + radius + 1);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width, x + radius + 1);
			output[y * width + x] =
				integral[y1 * stride + x1] -
				integral[y0 * stride + x1] -
				integral[y1 * stride + x0] +
				integral[y0 * stride + x0];
		}
	}
	return output;
}

export function simeparField(
	data: Uint8ClampedArray,
	width: number,
	height: number,
) {
	const count = new Float32Array(width * height);
	const sum = new Float32Array(width * height);
	for (let p = 0; p < count.length; p++) {
		const value = paletteValue(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
		if (value < 0) continue;
		count[p] = 1;
		sum[p] = value;
	}
	for (const [x0, y0, x1, y1] of MASKED_REGIONS) {
		for (let y = y0; y < Math.min(y1, height); y++) {
			for (let x = x0; x < Math.min(x1, width); x++) {
				count[y * width + x] = 0;
				sum[y * width + x] = 0;
			}
		}
	}
	const presence = boxSum(count, width, height, PRESENCE_RADIUS).map(
		(n) => n / (2 * PRESENCE_RADIUS + 1) ** 2,
	);
	return {
		presence,
		valueSum: boxSum(sum, width, height, VALUE_RADIUS),
		valueCount: boxSum(count, width, height, VALUE_RADIUS),
	};
}

function bilinear(
	grid: Float32Array,
	width: number,
	height: number,
	x: number,
	y: number,
) {
	const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
	const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
	const x1 = Math.min(width - 1, x0 + 1);
	const y1 = Math.min(height - 1, y0 + 1);
	const fx = Math.max(0, Math.min(1, x - x0));
	const fy = Math.max(0, Math.min(1, y - y0));
	const top = grid[y0 * width + x0] * (1 - fx) + grid[y0 * width + x1] * fx;
	const bottom = grid[y1 * width + x0] * (1 - fx) + grid[y1 * width + x1] * fx;
	return top * (1 - fy) + bottom * fy;
}

function hdImage(source: ImageData) {
	const { width, height } = source;
	const field = simeparField(source.data, width, height);
	const outWidth = width * HD_SCALE;
	const outHeight = height * HD_SCALE;
	const output = new Uint8ClampedArray(outWidth * outHeight * 4);
	const yNorth = mercatorY(SIMEPAR_BOUNDS.north);
	const ySouth = mercatorY(SIMEPAR_BOUNDS.south);
	const latSpan = SIMEPAR_BOUNDS.north - SIMEPAR_BOUNDS.south;
	for (let j = 0; j < outHeight; j++) {
		const lat = latFromMercatorY(
			yNorth + ((j + 0.5) / outHeight) * (ySouth - yNorth),
		);
		const y = ((SIMEPAR_BOUNDS.north - lat) / latSpan) * height - 0.5;
		for (let i = 0; i < outWidth; i++) {
			const x = (i + 0.5) / HD_SCALE - 0.5;
			if (bilinear(field.presence, width, height, x, y) < MIN_PRESENCE)
				continue;
			const n = bilinear(field.valueCount, width, height, x, y);
			if (n <= 0) continue;
			const [r, g, b] = SIMEPAR_SCALE.rgba(
				bilinear(field.valueSum, width, height, x, y) / n,
			);
			const p = (j * outWidth + i) * 4;
			output[p] = r;
			output[p + 1] = g;
			output[p + 2] = b;
			output[p + 3] = 255;
		}
	}
	return new ImageData(output, outWidth, outHeight);
}

function toMercatorRows(image: ImageData) {
	const { width, height } = image;
	const output = new Uint8ClampedArray(image.data.length);
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
			image.data.subarray(sourceRow * width * 4, (sourceRow + 1) * width * 4),
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
	frame: number,
	style: SimeparStyle,
	cacheKey: number,
): Promise<FieldImage> {
	const response = await fetch(`/api/simepar?frame=${frame}&t=${cacheKey}`);
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
	const image = style === "hd" ? hdImage(source) : toMercatorRows(source);
	canvas.width = image.width;
	canvas.height = image.height;
	context.putImageData(image, 0, 0);
	return { url: canvas.toDataURL(), corners: SIMEPAR_CORNERS };
}
