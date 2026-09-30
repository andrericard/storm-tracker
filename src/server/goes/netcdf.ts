import h5wasm, { type Dataset, type File } from "h5wasm/node";
import {
	type GeosProjection,
	latLonToScan,
	scanToLatLon,
} from "#/server/goes/projection";

export interface BoundingBox {
	west: number;
	south: number;
	east: number;
	north: number;
}

export interface AbiWindow {
	values: Float32Array;
	rows: number;
	cols: number;
	row0: number;
	col0: number;
	xScale: number;
	xOffset: number;
	yScale: number;
	yOffset: number;
	projection: GeosProjection;
}

let ready: Promise<unknown> | null = null;

async function openFile(path: string) {
	ready ??= h5wasm.ready;
	await ready;
	return new h5wasm.File(path, "r");
}

function dataset(file: File, name: string) {
	const node = file.get(name);
	if (!(node instanceof h5wasm.Dataset)) {
		throw new Error(`Dataset ${name} not found in ${file.filename}`);
	}
	return node;
}

function attrValues(node: Dataset, name: string): number[] | null {
	const value = node.attrs[name]?.value;
	if (value === undefined || value === null) return null;
	if (typeof value === "number" || typeof value === "bigint") {
		return [Number(value)];
	}
	if (ArrayBuffer.isView(value) || Array.isArray(value)) {
		return Array.from(value as ArrayLike<number>, Number);
	}
	return null;
}

function attrNumber(node: Dataset, name: string, fallback: number) {
	return attrValues(node, name)?.[0] ?? fallback;
}

function readProjection(file: File): GeosProjection {
	const proj = dataset(file, "goes_imager_projection");
	const equatorialRadius = attrNumber(proj, "semi_major_axis", 6378137);
	return {
		satelliteHeight:
			attrNumber(proj, "perspective_point_height", 35786023) + equatorialRadius,
		equatorialRadius,
		polarRadius: attrNumber(proj, "semi_minor_axis", 6356752.31414),
		longitudeOrigin: attrNumber(proj, "longitude_of_projection_origin", -75),
	};
}

function perimeter(bbox: BoundingBox, steps = 24) {
	const points: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const lon = bbox.west + (bbox.east - bbox.west) * t;
		const lat = bbox.south + (bbox.north - bbox.south) * t;
		points.push(
			[bbox.south, lon],
			[bbox.north, lon],
			[lat, bbox.west],
			[lat, bbox.east],
		);
	}
	return points;
}

export async function readAbiWindow(
	path: string,
	variable: string,
	bbox: BoundingBox,
): Promise<AbiWindow> {
	const file = await openFile(path);
	try {
		const projection = readProjection(file);
		const xDs = dataset(file, "x");
		const yDs = dataset(file, "y");
		const values = dataset(file, variable);
		const [height, width] = values.shape ?? [0, 0];
		const xScale = attrNumber(xDs, "scale_factor", 1);
		const xOffset = attrNumber(xDs, "add_offset", 0);
		const yScale = attrNumber(yDs, "scale_factor", 1);
		const yOffset = attrNumber(yDs, "add_offset", 0);

		let minCol = Number.POSITIVE_INFINITY;
		let maxCol = Number.NEGATIVE_INFINITY;
		let minRow = Number.POSITIVE_INFINITY;
		let maxRow = Number.NEGATIVE_INFINITY;
		for (const [lat, lon] of perimeter(bbox)) {
			const scan = latLonToScan(projection, lat, lon);
			const col = (scan.x - xOffset) / xScale;
			const row = (scan.y - yOffset) / yScale;
			minCol = Math.min(minCol, col);
			maxCol = Math.max(maxCol, col);
			minRow = Math.min(minRow, row);
			maxRow = Math.max(maxRow, row);
		}
		const col0 = Math.max(0, Math.floor(minCol) - 2);
		const col1 = Math.min(width, Math.ceil(maxCol) + 3);
		const row0 = Math.max(0, Math.floor(minRow) - 2);
		const row1 = Math.min(height, Math.ceil(maxRow) + 3);

		const raw = values.slice([
			[row0, row1],
			[col0, col1],
		]) as ArrayLike<number>;
		const scale = attrNumber(values, "scale_factor", 1);
		const offset = attrNumber(values, "add_offset", 0);
		const fill = attrValues(values, "_FillValue")?.[0];
		const validRange = attrValues(values, "valid_range");
		const output = new Float32Array(raw.length);
		for (let i = 0; i < raw.length; i++) {
			const v = raw[i];
			const invalid =
				v === fill ||
				(validRange !== null && (v < validRange[0] || v > validRange[1]));
			output[i] = invalid ? Number.NaN : v * scale + offset;
		}
		return {
			values: output,
			rows: row1 - row0,
			cols: col1 - col0,
			row0,
			col0,
			xScale,
			xOffset,
			yScale,
			yOffset,
			projection,
		};
	} finally {
		file.close();
	}
}

export function windowPixelLatLon(window: AbiWindow, row: number, col: number) {
	return scanToLatLon(
		window.projection,
		(window.col0 + col) * window.xScale + window.xOffset,
		(window.row0 + row) * window.yScale + window.yOffset,
	);
}

export function sampleWindow(window: AbiWindow, lat: number, lon: number) {
	const scan = latLonToScan(window.projection, lat, lon);
	const col =
		Math.round((scan.x - window.xOffset) / window.xScale) - window.col0;
	const row =
		Math.round((scan.y - window.yOffset) / window.yScale) - window.row0;
	if (row < 0 || col < 0 || row >= window.rows || col >= window.cols) {
		return Number.NaN;
	}
	return window.values[row * window.cols + col];
}

export async function readFlashes(path: string, bbox: BoundingBox) {
	const file = await openFile(path);
	try {
		const lats = dataset(file, "flash_lat").value as ArrayLike<number> | null;
		const lons = dataset(file, "flash_lon").value as ArrayLike<number> | null;
		const flashes: number[] = [];
		if (!lats || !lons) return flashes;
		for (let i = 0; i < lats.length; i++) {
			const lat = lats[i];
			const lon = lons[i];
			if (
				lat >= bbox.south &&
				lat <= bbox.north &&
				lon >= bbox.west &&
				lon <= bbox.east
			) {
				flashes.push(Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4);
			}
		}
		return flashes;
	} finally {
		file.close();
	}
}
