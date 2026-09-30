import type { Feature, FeatureCollection, LineString } from "geojson";
import type { ColorScale } from "#/lib/color-scale";
import { distanceKm } from "#/lib/geo";
import {
	latFromMercatorY,
	type MercatorCorners,
	mercatorY,
} from "#/lib/mercator-grid";
import type { GridSpec, LatLon } from "#/lib/storm-types";

const UPSAMPLE = 6;
const CONTOUR_UPSAMPLE = 4;

export interface FieldImage {
	url: string;
	corners: MercatorCorners;
}

function bilinear(grid: GridSpec, values: number[], lon: number, lat: number) {
	const x = (lon - grid.west) / grid.step;
	const y = (lat - grid.south) / grid.step;
	const c0 = Math.min(grid.cols - 2, Math.max(0, Math.floor(x)));
	const r0 = Math.min(grid.rows - 2, Math.max(0, Math.floor(y)));
	const tx = Math.min(1, Math.max(0, x - c0));
	const ty = Math.min(1, Math.max(0, y - r0));
	const at = (r: number, c: number) => values[r * grid.cols + c];
	const top = at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx;
	const bottom = at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx;
	return top * (1 - ty) + bottom * ty;
}

function extent(grid: GridSpec) {
	return {
		west: grid.west,
		east: grid.west + (grid.cols - 1) * grid.step,
		south: grid.south,
		north: grid.south + (grid.rows - 1) * grid.step,
	};
}

export function fieldImage(
	grid: GridSpec,
	values: number[],
	scale: ColorScale,
	target: LatLon,
	radiusKm: number,
): FieldImage {
	const { west, east, south, north } = extent(grid);
	const width = (grid.cols - 1) * UPSAMPLE;
	const height = (grid.rows - 1) * UPSAMPLE;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	const corners: MercatorCorners = [
		[west, north],
		[east, north],
		[east, south],
		[west, south],
	];
	if (!context) return { url: "", corners };
	const image = context.createImageData(width, height);
	const yNorth = mercatorY(north);
	const ySouth = mercatorY(south);
	for (let j = 0; j < height; j++) {
		const lat = latFromMercatorY(
			yNorth + ((j + 0.5) / height) * (ySouth - yNorth),
		);
		for (let i = 0; i < width; i++) {
			const lon = west + ((i + 0.5) / width) * (east - west);
			if (distanceKm(target, { lat, lon }) > radiusKm) continue;
			const [r, g, b, a] = scale.rgba(bilinear(grid, values, lon, lat));
			const p = (j * width + i) * 4;
			image.data[p] = r;
			image.data[p + 1] = g;
			image.data[p + 2] = b;
			image.data[p + 3] = Math.round(a * 255);
		}
	}
	context.putImageData(image, 0, 0);
	return { url: canvas.toDataURL(), corners };
}

type Segment = [[number, number], [number, number]];

function interpolate(
	a: [number, number],
	b: [number, number],
	va: number,
	vb: number,
	level: number,
): [number, number] {
	const t = (level - va) / (vb - va);
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function marchingSquares(
	cols: number,
	rows: number,
	west: number,
	south: number,
	step: number,
	values: Float32Array,
	level: number,
) {
	const segments: Segment[] = [];
	for (let r = 0; r < rows - 1; r++) {
		for (let c = 0; c < cols - 1; c++) {
			const v = [
				values[r * cols + c],
				values[r * cols + c + 1],
				values[(r + 1) * cols + c + 1],
				values[(r + 1) * cols + c],
			];
			const p: [number, number][] = [
				[west + c * step, south + r * step],
				[west + (c + 1) * step, south + r * step],
				[west + (c + 1) * step, south + (r + 1) * step],
				[west + c * step, south + (r + 1) * step],
			];
			let index = 0;
			for (let k = 0; k < 4; k++) if (v[k] >= level) index |= 1 << k;
			if (index === 0 || index === 15) continue;
			const edge = (k: number) =>
				interpolate(p[k], p[(k + 1) % 4], v[k], v[(k + 1) % 4], level);
			const pairs: number[][] =
				index === 5
					? [
							[0, 1],
							[2, 3],
						]
					: index === 10
						? [
								[0, 3],
								[1, 2],
							]
						: [
								[0, 1, 2, 3].filter(
									(k) => v[k] >= level !== v[(k + 1) % 4] >= level,
								),
							];
			for (const pair of pairs) {
				if (pair.length === 2) segments.push([edge(pair[0]), edge(pair[1])]);
			}
		}
	}
	return segments;
}

function joinSegments(segments: Segment[]) {
	const key = (p: [number, number]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
	const byStart = new Map<string, Segment[]>();
	for (const seg of segments) {
		for (const [a, b] of [
			[seg[0], seg[1]],
			[seg[1], seg[0]],
		] as Segment[]) {
			const list = byStart.get(key(a)) ?? [];
			list.push([a, b]);
			byStart.set(key(a), list);
		}
	}
	const used = new Set<Segment>();
	const lines: [number, number][][] = [];
	const take = (from: [number, number]) => {
		const list = byStart.get(key(from));
		if (!list) return null;
		for (const seg of list) {
			const original = segments.find(
				(s) =>
					!used.has(s) &&
					((s[0] === seg[0] && s[1] === seg[1]) ||
						(s[1] === seg[0] && s[0] === seg[1])),
			);
			if (original) {
				used.add(original);
				return seg[1];
			}
		}
		return null;
	};
	for (const seg of segments) {
		if (used.has(seg)) continue;
		used.add(seg);
		const line: [number, number][] = [seg[0], seg[1]];
		let next = take(seg[1]);
		while (next) {
			line.push(next);
			next = take(next);
		}
		let prev = take(seg[0]);
		while (prev) {
			line.unshift(prev);
			prev = take(prev);
		}
		lines.push(line);
	}
	return lines;
}

export function contourLines(
	grid: GridSpec,
	values: number[],
	interval: number,
	target: LatLon,
	radiusKm: number,
	decimals = 0,
): FeatureCollection<LineString> {
	const { west, south } = extent(grid);
	const cols = (grid.cols - 1) * CONTOUR_UPSAMPLE + 1;
	const rows = (grid.rows - 1) * CONTOUR_UPSAMPLE + 1;
	const step = grid.step / CONTOUR_UPSAMPLE;
	const fine = new Float32Array(cols * rows);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			fine[r * cols + c] = bilinear(
				grid,
				values,
				west + c * step,
				south + r * step,
			);
		}
	}
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const v of fine) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const features: Feature<LineString>[] = [];
	const start = Math.ceil(min / interval) * interval;
	for (let level = start; level <= max; level += interval) {
		const segments = marchingSquares(
			cols,
			rows,
			west,
			south,
			step,
			fine,
			level,
		);
		for (const line of joinSegments(
			segments.filter((segment) =>
				segment.every(
					([lon, lat]) => distanceKm(target, { lat, lon }) <= radiusKm,
				),
			),
		)) {
			if (line.length < 4) continue;
			features.push({
				type: "Feature",
				properties: { level, label: level.toFixed(decimals) },
				geometry: { type: "LineString", coordinates: line },
			});
		}
	}
	return { type: "FeatureCollection", features };
}
