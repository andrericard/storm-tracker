import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GribMessage, parseGribIndex } from "@mattnucc/gribberish";
import type { GridSpec } from "#/lib/storm-types";
import type { BoundingBox } from "#/server/goes/netcdf";
import { mapLimit } from "#/server/goes/s3";

const BUCKET_URL = "https://noaa-gfs-bdp-pds.s3.amazonaws.com";
const CACHE_DIR = join(tmpdir(), "storm-tracker-cache", "gfs");
const GLOBAL_STEP = 0.25;
const GLOBAL_COLS = 1440;
const CYCLE_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;
const MAX_CYCLES_BACK = 4;

export const PRESSURE_LEVELS = [925, 850, 700, 500] as const;

const FIELD_SPECS = {
	mslp: ["PRMSL", "mean sea level"],
	cape: ["CAPE", "surface"],
	cin: ["CIN", "surface"],
	liftedIndex: ["LFTX", "surface"],
	helicity3km: ["HLCY", "3000-0 m above ground"],
	temperature2m: ["TMP", "2 m above ground"],
	dewPoint2m: ["DPT", "2 m above ground"],
	surfaceHeight: ["HGT", "surface"],
	u10m: ["UGRD", "10 m above ground"],
	v10m: ["VGRD", "10 m above ground"],
	u925: ["UGRD", "925 mb"],
	v925: ["VGRD", "925 mb"],
	h925: ["HGT", "925 mb"],
	u850: ["UGRD", "850 mb"],
	v850: ["VGRD", "850 mb"],
	h850: ["HGT", "850 mb"],
	u700: ["UGRD", "700 mb"],
	v700: ["VGRD", "700 mb"],
	h700: ["HGT", "700 mb"],
	u500: ["UGRD", "500 mb"],
	v500: ["VGRD", "500 mb"],
	h500: ["HGT", "500 mb"],
} as const;

export type GfsFieldName = keyof typeof FIELD_SPECS;

export interface GfsRun {
	cycle: string;
	forecastHour: number;
	validTime: string;
}

export interface GfsFields {
	run: GfsRun;
	grid: GridSpec;
	fields: Record<GfsFieldName, Float32Array>;
}

interface CropSpec {
	grid: GridSpec;
	rowStart: number;
	colStart: number;
}

const memory = new Map<string, Promise<GfsFields>>();

function cycleInfo(cycleTime: number) {
	const date = new Date(cycleTime);
	const day = date.toISOString().slice(0, 10).replaceAll("-", "");
	const hour = String(date.getUTCHours()).padStart(2, "0");
	return {
		day,
		hour,
		cycle: `${day}${hour}`,
		path: (forecastHour: number) =>
			`gfs.${day}/${hour}/atmos/gfs.t${hour}z.pgrb2.0p25.f${String(forecastHour).padStart(3, "0")}`,
	};
}

async function locateRun(now: number) {
	const latestCycle = Math.floor(now / CYCLE_MS) * CYCLE_MS;
	for (let back = 0; back <= MAX_CYCLES_BACK; back++) {
		const cycleTime = latestCycle - back * CYCLE_MS;
		const forecastHour = Math.round((now - cycleTime) / HOUR_MS);
		const info = cycleInfo(cycleTime);
		const url = `${BUCKET_URL}/${info.path(forecastHour)}.idx`;
		const response = await fetch(url);
		if (!response.ok) continue;
		return {
			run: {
				cycle: info.cycle,
				forecastHour,
				validTime: new Date(cycleTime + forecastHour * HOUR_MS).toISOString(),
			},
			path: info.path(forecastHour),
			indexText: await response.text(),
		};
	}
	throw new Error("No recent GFS run available");
}

function cropSpec(bbox: BoundingBox): CropSpec {
	const north = Math.min(
		90,
		Math.ceil(bbox.north / GLOBAL_STEP) * GLOBAL_STEP + GLOBAL_STEP,
	);
	const south = Math.max(
		-90,
		Math.floor(bbox.south / GLOBAL_STEP) * GLOBAL_STEP - GLOBAL_STEP,
	);
	const west = Math.floor(bbox.west / GLOBAL_STEP) * GLOBAL_STEP - GLOBAL_STEP;
	const east = Math.ceil(bbox.east / GLOBAL_STEP) * GLOBAL_STEP + GLOBAL_STEP;
	const rows = Math.round((north - south) / GLOBAL_STEP) + 1;
	const cols = Math.round((east - west) / GLOBAL_STEP) + 1;
	return {
		grid: { west, south, step: GLOBAL_STEP, cols, rows },
		rowStart: Math.round((90 - north) / GLOBAL_STEP),
		colStart: (Math.round(west / GLOBAL_STEP) + GLOBAL_COLS) % GLOBAL_COLS,
	};
}

function cropField(data: ArrayLike<number>, crop: CropSpec) {
	const { grid, rowStart, colStart } = crop;
	const output = new Float32Array(grid.rows * grid.cols);
	for (let r = 0; r < grid.rows; r++) {
		const sourceRow = rowStart + (grid.rows - 1 - r);
		for (let c = 0; c < grid.cols; c++) {
			const sourceCol = (colStart + c) % GLOBAL_COLS;
			output[r * grid.cols + c] = data[sourceRow * GLOBAL_COLS + sourceCol];
		}
	}
	return output;
}

async function fetchField(
	path: string,
	entries: ReturnType<typeof parseGribIndex>,
	spec: readonly [string, string],
	crop: CropSpec,
) {
	const entry = entries.find((e) => e.var === spec[0] && e.level === spec[1]);
	if (!entry) throw new Error(`GFS field ${spec[0]} ${spec[1]} not found`);
	const end = entry.offset + (entry.length ?? 8_000_000) - 1;
	const response = await fetch(`${BUCKET_URL}/${path}`, {
		headers: { Range: `bytes=${entry.offset}-${end}` },
	});
	if (!response.ok)
		throw new Error(`GFS range request failed: ${response.status}`);
	const message = GribMessage.parseFromBuffer(
		new Uint8Array(await response.arrayBuffer()),
		0,
	);
	const shape = message.gridShape;
	if (shape.cols !== GLOBAL_COLS) {
		throw new Error(`Unexpected GFS grid ${shape.rows}x${shape.cols}`);
	}
	return cropField(message.data, crop);
}

function cacheKeyFor(run: GfsRun, grid: GridSpec) {
	return `${run.cycle}-f${run.forecastHour}-${grid.west}-${grid.south}-${grid.cols}-${grid.rows}`;
}

async function readCache(key: string): Promise<GfsFields | null> {
	const path = join(CACHE_DIR, `${key}.json`);
	if (!existsSync(path)) return null;
	const parsed = JSON.parse(await readFile(path, "utf8")) as {
		run: GfsRun;
		grid: GridSpec;
		fields: Record<GfsFieldName, number[]>;
	};
	const fields = Object.fromEntries(
		Object.entries(parsed.fields).map(([name, values]) => [
			name,
			Float32Array.from(values),
		]),
	) as Record<GfsFieldName, Float32Array>;
	return { run: parsed.run, grid: parsed.grid, fields };
}

async function writeCache(key: string, data: GfsFields) {
	await mkdir(CACHE_DIR, { recursive: true });
	const fields = Object.fromEntries(
		Object.entries(data.fields).map(([name, values]) => [
			name,
			Array.from(values, (v) => Math.round(v * 100) / 100),
		]),
	);
	await writeFile(
		join(CACHE_DIR, `${key}.json`),
		JSON.stringify({ run: data.run, grid: data.grid, fields }),
	);
}

async function load(bbox: BoundingBox): Promise<GfsFields> {
	const { run, path, indexText } = await locateRun(Date.now());
	const crop = cropSpec(bbox);
	const key = cacheKeyFor(run, crop.grid);
	const cached = await readCache(key).catch(() => null);
	if (cached) return cached;

	const entries = parseGribIndex(indexText);
	const names = Object.keys(FIELD_SPECS) as GfsFieldName[];
	const values = await mapLimit(names, 6, (name) =>
		fetchField(path, entries, FIELD_SPECS[name], crop),
	);
	const fields = Object.fromEntries(
		names.map((name, i) => [name, values[i]]),
	) as Record<GfsFieldName, Float32Array>;
	const result = { run, grid: crop.grid, fields };
	await writeCache(key, result).catch(() => undefined);
	return result;
}

export function fetchGfs(bbox: BoundingBox) {
	const hourKey = `${Math.floor(Date.now() / HOUR_MS)}|${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(2)},${bbox.north.toFixed(2)}`;
	const pending = memory.get(hourKey);
	if (pending) return pending;
	const task = load(bbox).catch((error) => {
		memory.delete(hourKey);
		throw error;
	});
	memory.set(hourKey, task);
	if (memory.size > 8) {
		const oldest = memory.keys().next().value;
		if (oldest) memory.delete(oldest);
	}
	return task;
}
