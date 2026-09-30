import { distanceKm, EARTH_RADIUS_KM } from "#/lib/geo";
import type {
	Frame,
	FramesResponse,
	GridSpec,
	LatLon,
} from "#/lib/storm-types";
import { attachEnvironments, buildEnvironment } from "#/server/gfs/environment";
import { fetchGfs } from "#/server/gfs/fetch";
import {
	type AbiWindow,
	type BoundingBox,
	readAbiWindow,
	readFlashes,
	sampleWindow,
	windowPixelLatLon,
} from "#/server/goes/netcdf";
import {
	download,
	listRecent,
	mapLimit,
	type S3Object,
} from "#/server/goes/s3";
import {
	assignTracks,
	type DetectedStorm,
	detectStorms,
	type FrameGrid,
	matrixMotion,
	summarizeTracks,
} from "#/server/goes/storms";

const GRID_STEP_DEG = 0.05;
const FRAME_INTERVAL_MS = 10 * 60 * 1000;
const RENDER_THRESHOLD_K = 270;
const SURFACE_TEMP_K = 300;
const LAPSE_RATE_K_PER_M = 0.0065;
const RAIN_MIN_MMH = 0.2;

interface ProcessedFrame {
	grid: FrameGrid;
	frame: Omit<Frame, "storms">;
	storms: DetectedStorm[];
}

// IDs persist across overlapping refresh windows within this server process.
const trackWindows = new Map<
	string,
	{ nextId: number; frames: Map<number, Map<number, number>> }
>();
const processedCache = new Map<string, ProcessedFrame>();

function boundingBox(target: LatLon, radiusKm: number): BoundingBox {
	const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
	const dLon = dLat / Math.cos((target.lat * Math.PI) / 180);
	return {
		west: target.lon - dLon,
		east: target.lon + dLon,
		south: target.lat - dLat,
		north: target.lat + dLat,
	};
}

function gridFor(bbox: BoundingBox): GridSpec {
	const west = Math.floor(bbox.west / GRID_STEP_DEG) * GRID_STEP_DEG;
	const south = Math.floor(bbox.south / GRID_STEP_DEG) * GRID_STEP_DEG;
	return {
		west: Math.round(west * 1000) / 1000,
		south: Math.round(south * 1000) / 1000,
		step: GRID_STEP_DEG,
		cols: Math.ceil((bbox.east - west) / GRID_STEP_DEG),
		rows: Math.ceil((bbox.north - south) / GRID_STEP_DEG),
	};
}

function estimateHeight(brightnessTemp: number) {
	return Math.min(
		17000,
		Math.max(500, (SURFACE_TEMP_K - brightnessTemp) / LAPSE_RATE_K_PER_M),
	);
}

function binWindow(
	grid: GridSpec,
	window: AbiWindow,
	pick: (current: number, value: number) => number,
) {
	const output = new Float32Array(grid.cols * grid.rows).fill(Number.NaN);
	for (let r = 0; r < window.rows; r++) {
		for (let c = 0; c < window.cols; c++) {
			const value = window.values[r * window.cols + c];
			if (Number.isNaN(value)) continue;
			const position = windowPixelLatLon(window, r, c);
			if (!position) continue;
			const col = Math.floor((position.lon - grid.west) / grid.step);
			const row = Math.floor((position.lat - grid.south) / grid.step);
			if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) continue;
			const index = row * grid.cols + col;
			const current = output[index];
			output[index] = Number.isNaN(current) ? value : pick(current, value);
		}
	}
	return output;
}

const binBrightnessTemp = (grid: GridSpec, window: AbiWindow) =>
	binWindow(grid, window, Math.min);
const binRainRate = (grid: GridSpec, window: AbiWindow) =>
	binWindow(grid, window, Math.max);

function cellIndex(grid: GridSpec, lon: number, lat: number) {
	const col = Math.floor((lon - grid.west) / grid.step);
	const row = Math.floor((lat - grid.south) / grid.step);
	if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return -1;
	return row * grid.cols + col;
}

async function processFrame(
	grid: GridSpec,
	bbox: BoundingBox,
	target: LatLon,
	radiusKm: number,
	c13: S3Object,
	acha: S3Object | undefined,
	rrqpe: S3Object | undefined,
	glm: S3Object[],
): Promise<ProcessedFrame> {
	const cacheKey = `${target.lat},${target.lon},${radiusKm}|${c13.key}|${acha?.key ?? ""}|${rrqpe?.key ?? ""}|${glm.length}|${grid.west},${grid.south},${grid.cols},${grid.rows}`;
	const cached = processedCache.get(cacheKey);
	if (cached) return cached;

	const [c13Path, achaPath, rrqpePath, glmPaths] = await Promise.all([
		download(c13.key),
		acha ? download(acha.key).catch(() => null) : Promise.resolve(null),
		rrqpe ? download(rrqpe.key).catch(() => null) : Promise.resolve(null),
		mapLimit(glm, 8, (o) => download(o.key).catch(() => null)),
	]);

	const brightnessTemp = binBrightnessTemp(
		grid,
		await readAbiWindow(c13Path, "CMI", bbox),
	);
	const heightWindow = achaPath
		? await readAbiWindow(achaPath, "HT", bbox).catch(() => null)
		: null;

	const rainWindow = rrqpePath
		? await readAbiWindow(rrqpePath, "RRQPE", bbox).catch(() => null)
		: null;
	const rainRate = rainWindow
		? binRainRate(grid, rainWindow)
		: new Float32Array(grid.cols * grid.rows).fill(Number.NaN);
	const rain = { index: [] as number[], rate: [] as number[] };
	for (let index = 0; index < rainRate.length; index++) {
		const value = rainRate[index];
		if (!(value >= RAIN_MIN_MMH)) {
			rainRate[index] = 0;
			continue;
		}
		const center = {
			lat: grid.south + (Math.floor(index / grid.cols) + 0.5) * grid.step,
			lon: grid.west + ((index % grid.cols) + 0.5) * grid.step,
		};
		if (distanceKm(target, center) > radiusKm) {
			rainRate[index] = 0;
			continue;
		}
		rain.index.push(index);
		rain.rate.push(Math.round(value * 10));
	}
	const targetCell = cellIndex(grid, target.lon, target.lat);
	const rainAtTargetMmh =
		targetCell >= 0 ? Math.round(rainRate[targetCell] * 10) / 10 : 0;

	const height = new Float32Array(grid.cols * grid.rows);
	const cells = {
		index: [] as number[],
		brightnessTemp: [] as number[],
		height: [] as number[],
	};
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			const index = row * grid.cols + col;
			const bt = brightnessTemp[index];
			if (!(bt < RENDER_THRESHOLD_K)) continue;
			const center = {
				lat: grid.south + (row + 0.5) * grid.step,
				lon: grid.west + (col + 0.5) * grid.step,
			};
			if (distanceKm(target, center) > radiusKm) {
				brightnessTemp[index] = Number.NaN;
				continue;
			}
			let h = Number.NaN;
			if (heightWindow) {
				h = sampleWindow(
					heightWindow,
					grid.south + (row + 0.5) * grid.step,
					grid.west + (col + 0.5) * grid.step,
				);
			}
			if (!(h > 0)) h = estimateHeight(bt);
			height[index] = h;
			cells.index.push(index);
			cells.brightnessTemp.push(Math.round(bt * 10));
			cells.height.push(Math.round(h / 50) * 50);
		}
	}

	const flashes: number[] = [];
	for (const path of glmPaths) {
		if (!path) continue;
		const found = await readFlashes(path, bbox).catch(() => []);
		for (const value of found) flashes.push(value);
	}
	const flashCells: number[] = [];
	for (let i = 0; i < flashes.length; i += 2) {
		const index = cellIndex(grid, flashes[i], flashes[i + 1]);
		if (index >= 0) flashCells.push(index);
	}

	const frameGrid: FrameGrid = {
		time: c13.start,
		brightnessTemp,
		height,
		rainRate,
		flashCells: Int32Array.from(flashCells),
	};
	const processed: ProcessedFrame = {
		grid: frameGrid,
		frame: {
			time: new Date(c13.start).toISOString(),
			heightSource: heightWindow ? "acha" : "estimated",
			cells,
			rain,
			rainAtTargetMmh,
			flashes,
		},
		storms: detectStorms(grid, frameGrid),
	};
	const glmComplete =
		glm.length >= 29 || Date.now() - c13.start > 25 * 60 * 1000;
	if (glmComplete && heightWindow && rainWindow) {
		processedCache.set(cacheKey, processed);
		if (processedCache.size > 60) {
			const oldest = processedCache.keys().next().value;
			if (oldest) processedCache.delete(oldest);
		}
	}
	return processed;
}

export async function buildFrames(
	target: LatLon,
	frameCount: number,
	radiusKm: number,
): Promise<FramesResponse> {
	const bbox = boundingBox(target, radiusKm);
	const grid = gridFor(bbox);
	const since = Date.now() - (frameCount + 2) * FRAME_INTERVAL_MS;
	const gfsTask = fetchGfs(bbox).catch((error) => {
		console.error("GFS unavailable:", error);
		return null;
	});

	const [c13Objects, achaObjects, rrqpeObjects, glmObjects] = await Promise.all(
		[
			listRecent("ABI-L2-CMIPF", since, (key) => key.includes("-M6C13_")),
			listRecent("ABI-L2-ACHAF", since),
			listRecent("ABI-L2-RRQPEF", since),
			listRecent("GLM-L2-LCFA", since),
		],
	);
	const selected = c13Objects.slice(-frameCount);
	const achaByStamp = new Map(achaObjects.map((o) => [o.stamp, o]));
	const rrqpeByStamp = new Map(rrqpeObjects.map((o) => [o.stamp, o]));

	const processed = await mapLimit(selected, 3, (c13) =>
		processFrame(
			grid,
			bbox,
			target,
			radiusKm,
			c13,
			achaByStamp.get(c13.stamp),
			rrqpeByStamp.get(c13.stamp),
			glmObjects.filter(
				(o) => o.start >= c13.start && o.start < c13.start + FRAME_INTERVAL_MS,
			),
		),
	);

	const framesStorms: DetectedStorm[][] = processed.map((p) =>
		p.storms.map((s) => ({ cells: s.cells, snapshot: { ...s.snapshot } })),
	);
	const key = `${target.lat},${target.lon},${radiusKm}`;
	const saved = trackWindows.get(key);
	for (let i = 0; i < processed.length; i++) {
		for (const storm of framesStorms[i]) {
			storm.snapshot.trackId =
				saved?.frames
					.get(processed[i].grid.time)
					?.get(Math.min(...storm.cells)) ?? 0;
			if (i > 0)
				storm.motion = matrixMotion(
					grid,
					processed[i].grid,
					processed[Math.max(0, i - 2)].grid,
					storm.cells,
				);
		}
	}
	const nextId = assignTracks(
		framesStorms,
		grid,
		processed.map((p) => p.grid.time),
		saved?.nextId ?? 1,
	);
	trackWindows.set(key, {
		nextId,
		frames: new Map(
			processed.map((p, i) => [
				p.grid.time,
				new Map(
					framesStorms[i].map((s) => [
						Math.min(...s.cells),
						s.snapshot.trackId,
					]),
				),
			]),
		),
	});
	if (trackWindows.size > 20) {
		const oldest = trackWindows.keys().next().value;
		if (oldest) trackWindows.delete(oldest);
	}
	const tracks = summarizeTracks(
		processed.map((p) => p.grid.time),
		framesStorms,
		target,
	);
	const gfs = await gfsTask;
	if (gfs) attachEnvironments(gfs, tracks);

	return {
		target,
		radiusKm,
		grid,
		frames: processed.map((p, i) => ({
			...p.frame,
			storms: framesStorms[i].map((s) => s.snapshot),
		})),
		tracks,
		environment: gfs ? buildEnvironment(gfs, target, tracks) : null,
		generatedAt: new Date().toISOString(),
	};
}
