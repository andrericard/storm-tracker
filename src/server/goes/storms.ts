import {
	bearingDeg,
	destination,
	distanceKm,
	EARTH_RADIUS_KM,
	toLocalKm,
} from "#/lib/geo";
import type {
	GridSpec,
	LatLon,
	Severity,
	StormSnapshot,
	ThreatStatus,
	TrackSummary,
} from "#/lib/storm-types";

const SEGMENT_THRESHOLDS_K = [235, 225, 215, 205, 195];
const MIN_CELLS = 4;
const MAX_STORM_AREA_KM2 = 6000;
const FLASH_SEARCH_CELLS = 3;
const OVERSHOOT_RING_MIN = 3;
const OVERSHOOT_RING_MAX = 5;
const OVERSHOOT_MIN_DEPTH_K = 8;
const OVERSHOOT_MAX_TEMP_K = 210;
const JUMP_MIN_FLASHES = 60;
const JUMP_MIN_DELTA = 30;

const FORECAST_MINUTES = 180;

const MAX_PLAUSIBLE_SPEED_KMH = 150;

export interface DetectedStorm {
	snapshot: StormSnapshot;
	cells: number[];
	motion?: { vx: number; vy: number; quality: number };
}

export interface FrameGrid {
	time: number;
	brightnessTemp: Float32Array;
	height: Float32Array;
	rainRate: Float32Array;
	flashCells: Int32Array;
}

function cellAreaKm2(grid: GridSpec, row: number) {
	const lat = grid.south + (row + 0.5) * grid.step;
	const side = (grid.step * Math.PI * EARTH_RADIUS_KM) / 180;
	return side * side * Math.cos((lat * Math.PI) / 180);
}

function severityFor(minBrightnessTempK: number, flashCount: number): Severity {
	let score = 0;
	if (minBrightnessTempK < 200) score = 3;
	else if (minBrightnessTempK < 210) score = 2;
	else if (minBrightnessTempK < 220) score = 1;
	if (flashCount >= 60) score += 1;
	const levels: Severity[] = ["moderate", "strong", "severe", "extreme"];
	return levels[Math.min(score, 3)];
}

function convexHull(points: [number, number][]) {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (sorted.length < 3) return sorted;
	const cross = (
		o: [number, number],
		a: [number, number],
		b: [number, number],
	) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: [number, number][] = [];
	for (const p of sorted) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
		) {
			lower.pop();
		}
		lower.push(p);
	}
	const upper: [number, number][] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
		) {
			upper.pop();
		}
		upper.push(p);
	}
	const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
	hull.push(hull[0]);
	return hull.map(
		([lon, lat]) =>
			[Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] as [
				number,
				number,
			],
	);
}

function components(
	grid: GridSpec,
	brightnessTemp: Float32Array,
	candidates: number[],
	threshold: number,
) {
	const { cols, rows } = grid;
	const allowed = new Set<number>();
	for (const cell of candidates) {
		if (brightnessTemp[cell] < threshold) allowed.add(cell);
	}
	const visited = new Set<number>();
	const groups: number[][] = [];
	for (const start of allowed) {
		if (visited.has(start)) continue;
		const group: number[] = [];
		const stack = [start];
		visited.add(start);
		while (stack.length) {
			const current = stack.pop() as number;
			group.push(current);
			const r = Math.floor(current / cols);
			const c = current % cols;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
					const next = nr * cols + nc;
					if (allowed.has(next) && !visited.has(next)) {
						visited.add(next);
						stack.push(next);
					}
				}
			}
		}
		if (group.length >= MIN_CELLS) groups.push(group);
	}
	return groups;
}

function areaOf(grid: GridSpec, cells: number[]) {
	let area = 0;
	for (const cell of cells) {
		area += cellAreaKm2(grid, Math.floor(cell / grid.cols));
	}
	return area;
}

function segment(
	grid: GridSpec,
	brightnessTemp: Float32Array,
	cells: number[],
	level: number,
): number[][] {
	const nextThreshold = SEGMENT_THRESHOLDS_K[level + 1];
	if (nextThreshold === undefined) return [cells];
	const cores = components(grid, brightnessTemp, cells, nextThreshold);
	const oversized = areaOf(grid, cells) > MAX_STORM_AREA_KM2;
	if (cores.length >= 2 || (cores.length === 1 && oversized)) {
		return cores.flatMap((core) =>
			segment(grid, brightnessTemp, core, level + 1),
		);
	}
	return [cells];
}

function assignFlashes(
	grid: GridSpec,
	groups: number[][],
	flashCells: Int32Array,
) {
	const { cols, rows } = grid;
	const owner = new Int32Array(cols * rows).fill(-1);
	let frontier: number[] = [];
	groups.forEach((group, index) => {
		for (const cell of group) {
			owner[cell] = index;
			frontier.push(cell);
		}
	});
	for (let step = 0; step < FLASH_SEARCH_CELLS; step++) {
		const next: number[] = [];
		for (const cell of frontier) {
			const r = Math.floor(cell / cols);
			const c = cell % cols;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
					const neighbor = nr * cols + nc;
					if (owner[neighbor] === -1) {
						owner[neighbor] = owner[cell];
						next.push(neighbor);
					}
				}
			}
		}
		frontier = next;
	}
	const counts = new Array<number>(groups.length).fill(0);
	for (const cell of flashCells) {
		if (owner[cell] >= 0) counts[owner[cell]]++;
	}
	return counts;
}

function overshootDepth(
	grid: GridSpec,
	brightnessTemp: Float32Array,
	cell: number,
) {
	const r0 = Math.floor(cell / grid.cols);
	const c0 = cell % grid.cols;
	let sum = 0;
	let count = 0;
	for (let dr = -OVERSHOOT_RING_MAX; dr <= OVERSHOOT_RING_MAX; dr++) {
		for (let dc = -OVERSHOOT_RING_MAX; dc <= OVERSHOOT_RING_MAX; dc++) {
			const ring = Math.max(Math.abs(dr), Math.abs(dc));
			if (ring < OVERSHOOT_RING_MIN) continue;
			const r = r0 + dr;
			const c = c0 + dc;
			if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
			const value = brightnessTemp[r * grid.cols + c];
			if (!(value < SEGMENT_THRESHOLDS_K[0])) continue;
			sum += value;
			count++;
		}
	}
	if (count < 8) return 0;
	return sum / count - brightnessTemp[cell];
}

export function detectStorms(grid: GridSpec, frame: FrameGrid) {
	const all: number[] = [];
	for (let i = 0; i < frame.brightnessTemp.length; i++) {
		if (frame.brightnessTemp[i] < SEGMENT_THRESHOLDS_K[0]) all.push(i);
	}
	const groups = components(
		grid,
		frame.brightnessTemp,
		all,
		SEGMENT_THRESHOLDS_K[0],
	).flatMap((group) => segment(grid, frame.brightnessTemp, group, 0));
	const flashCounts = assignFlashes(grid, groups, frame.flashCells);

	return groups.map((cells, index): DetectedStorm => {
		let weightSum = 0;
		let lonSum = 0;
		let latSum = 0;
		let minBt = Number.POSITIVE_INFINITY;
		let minCell = cells[0];
		let maxHeight = 0;
		let maxRain = 0;
		const corners: [number, number][] = [];
		const half = grid.step / 2;
		for (const cell of cells) {
			const r = Math.floor(cell / grid.cols);
			const c = cell % grid.cols;
			const lon = grid.west + (c + 0.5) * grid.step;
			const lat = grid.south + (r + 0.5) * grid.step;
			const cellBt = frame.brightnessTemp[cell];
			const weight = SEGMENT_THRESHOLDS_K[0] - cellBt + 1;
			weightSum += weight;
			lonSum += lon * weight;
			latSum += lat * weight;
			if (cellBt < minBt) {
				minBt = cellBt;
				minCell = cell;
			}
			if (frame.height[cell] > maxHeight) maxHeight = frame.height[cell];
			if (frame.rainRate[cell] > maxRain) maxRain = frame.rainRate[cell];
			corners.push(
				[lon - half, lat - half],
				[lon + half, lat - half],
				[lon + half, lat + half],
				[lon - half, lat + half],
			);
		}
		const flashCount = flashCounts[index];
		return {
			cells,
			snapshot: {
				trackId: 0,
				lon: lonSum / weightSum,
				lat: latSum / weightSum,
				areaKm2: Math.round(areaOf(grid, cells)),
				minBrightnessTempK: Math.round(minBt * 10) / 10,
				maxHeightM: Math.round(maxHeight),
				flashCount,
				severity: severityFor(minBt, flashCount),
				overshootDepthK:
					Math.round(overshootDepth(grid, frame.brightnessTemp, minCell) * 10) /
					10,
				maxRainRateMmh: Math.round(maxRain * 10) / 10,
				hull: convexHull(corners),
			},
		};
	});
}

export function assignTracks(
	framesStorms: DetectedStorm[][],
	grid: GridSpec,
	times: number[],
	nextId = 1,
) {
	let previous: DetectedStorm[] = [];
	for (let i = 0; i < framesStorms.length; i++) {
		const storms = framesStorms[i];
		const taken = new Set<number>();
		// Reserve known identities before matching new detections.
		for (const storm of storms)
			if (storm.snapshot.trackId) {
				const index = previous.findIndex(
					(p) => p.snapshot.trackId === storm.snapshot.trackId,
				);
				if (index >= 0) taken.add(index);
			}
		const hours = i ? (times[i] - times[i - 1]) / 3_600_000 : 0;
		for (const storm of [...storms].sort(
			(a, b) => b.cells.length - a.cells.length,
		)) {
			if (storm.snapshot.trackId) continue;
			let match = -1,
				best = 0;
			const motion = storm.motion;
			const dy = (grid.step * Math.PI * EARTH_RADIUS_KM) / 180;
			const dx = dy * Math.cos((storm.snapshot.lat * Math.PI) / 180);
			const dc = motion ? Math.round((motion.vx * hours) / dx) : 0;
			const dr = motion ? Math.round((motion.vy * hours) / dy) : 0;
			const shifted = new Set(
				storm.cells.flatMap((cell) => {
					const row = Math.floor(cell / grid.cols) - dr,
						col = (cell % grid.cols) - dc;
					return row >= 0 && row < grid.rows && col >= 0 && col < grid.cols
						? [row * grid.cols + col]
						: [];
				}),
			);
			previous.forEach((candidate, index) => {
				if (taken.has(index) || hours <= 0 || hours > 0.5) return;
				const offset = toLocalKm(candidate.snapshot, storm.snapshot);
				if (
					Math.hypot(offset.x, offset.y) >
					MAX_PLAUSIBLE_SPEED_KMH * hours + Math.hypot(dx, dy)
				)
					return;
				const residual = Math.hypot(
					offset.x - (motion?.vx ?? 0) * hours,
					offset.y - (motion?.vy ?? 0) * hours,
				);
				const overlap = candidate.cells.filter((cell) =>
					shifted.has(cell),
				).length;
				const iou = overlap / (candidate.cells.length + shifted.size - overlap);
				const areaRatio =
					Math.min(candidate.cells.length, storm.cells.length) /
					Math.max(candidate.cells.length, storm.cells.length);
				if (!overlap && (residual > 15 || areaRatio < 0.4)) return;
				const score = iou + (0.2 * areaRatio) / (1 + residual / 10);
				if (score > best) {
					best = score;
					match = index;
				}
			});
			if (match >= 0) {
				taken.add(match);
				storm.snapshot.trackId = previous[match].snapshot.trackId;
			} else storm.snapshot.trackId = nextId++;
		}
		previous = storms;
	}
	return nextId;
}

// Track the temperature pattern, not changes in the coldest pixel or centroid.
export function matrixMotion(
	grid: GridSpec,
	current: FrameGrid,
	previous: FrameGrid,
	cells: number[],
) {
	const hours = (current.time - previous.time) / 3_600_000;
	if (hours <= 0 || hours > 0.5 || !cells.length) return undefined;
	const lat = grid.south + Math.floor(cells[0] / grid.cols) * grid.step;
	const dyKm = (grid.step * Math.PI * EARTH_RADIUS_KM) / 180;
	const dxKm = dyKm * Math.cos((lat * Math.PI) / 180);
	const limit = Math.ceil(
		(MAX_PLAUSIBLE_SPEED_KMH * hours) / Math.min(dxKm, dyKm),
	);
	const rows = cells.map((c) => Math.floor(c / grid.cols));
	const cols = cells.map((c) => c % grid.cols);
	const samples: { r: number; c: number; value: number }[] = [];
	const r0 = Math.max(0, Math.min(...rows) - 3),
		r1 = Math.min(grid.rows - 1, Math.max(...rows) + 3);
	const c0 = Math.max(0, Math.min(...cols) - 3),
		c1 = Math.min(grid.cols - 1, Math.max(...cols) + 3);
	// ponytail: bounded patch sampling; use pyramidal optical flow if larger domains need it.
	const stride = Math.max(
		1,
		Math.ceil(Math.sqrt(((r1 - r0 + 1) * (c1 - c0 + 1)) / 400)),
	);
	for (let r = r0; r <= r1; r += stride)
		for (let c = c0; c <= c1; c += stride) {
			const value = current.brightnessTemp[r * grid.cols + c];
			if (Number.isFinite(value)) samples.push({ r, c, value });
		}
	let best = -1,
		runner = -1,
		bestX = 0,
		bestY = 0;
	const scores: { score: number; x: number; y: number }[] = [];
	for (let y = -limit; y <= limit; y++)
		for (let x = -limit; x <= limit; x++) {
			if (Math.hypot(x * dxKm, y * dyKm) / hours > MAX_PLAUSIBLE_SPEED_KMH)
				continue;
			let n = 0,
				a = 0,
				b = 0,
				aa = 0,
				bb = 0,
				ab = 0;
			for (const p of samples) {
				const r = p.r - y,
					c = p.c - x;
				if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) continue;
				const v = previous.brightnessTemp[r * grid.cols + c];
				if (!Number.isFinite(v)) continue;
				n++;
				a += p.value;
				b += v;
				aa += p.value * p.value;
				bb += v * v;
				ab += p.value * v;
			}
			if (
				n < 12 ||
				n < samples.length * 0.8 ||
				aa - (a * a) / n < n ||
				bb - (b * b) / n < n
			)
				continue;
			const score =
				(ab - (a * b) / n) / Math.sqrt((aa - (a * a) / n) * (bb - (b * b) / n));
			scores.push({ score, x, y });
			if (score > best) {
				best = score;
				bestX = x;
				bestY = y;
			}
		}
	for (const p of scores)
		if (Math.hypot(p.x - bestX, p.y - bestY) > 1.5)
			runner = Math.max(runner, p.score);
	if (best < 0.65 || best - runner < 0.015) return undefined;
	return {
		vx: (bestX * dxKm) / hours,
		vy: (bestY * dyKm) / hours,
		quality: best,
	};
}

function stableVelocity(
	samples: { vx: number; vy: number; quality: number }[],
) {
	const median = (values: number[]) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	};
	const mx = median(samples.map((s) => s.vx)),
		my = median(samples.map((s) => s.vy));
	const deviations = samples.map((s) => Math.hypot(s.vx - mx, s.vy - my));
	const limit = Math.max(15, 3 * median(deviations));
	let vx = 0,
		vy = 0,
		weight = 0;
	let count = 0;
	samples.forEach((s, i) => {
		if (deviations[i] > limit) return;
		count++;
		const w = s.quality * (1 + i / samples.length);
		vx += s.vx * w;
		vy += s.vy * w;
		weight += w;
	});
	vx /= weight;
	vy /= weight;
	const spread = Math.sqrt(
		samples.reduce(
			(sum, s, i) =>
				sum +
				(deviations[i] <= limit ? (s.vx - vx) ** 2 + (s.vy - vy) ** 2 : 0),
			0,
		) / count,
	);
	return {
		vx,
		vy,
		count,
		consistent: count >= 2 && spread <= Math.max(15, Math.hypot(vx, vy) * 0.5),
	};
}

function detectLightningJump(counts: number[]) {
	if (counts.length < 2) return false;
	const current = counts[counts.length - 1];
	const deltas = [];
	for (let i = 1; i < counts.length; i++)
		deltas.push(counts[i] - counts[i - 1]);
	const last = deltas[deltas.length - 1];
	if (current < JUMP_MIN_FLASHES || last < JUMP_MIN_DELTA) return false;
	const prior = deltas.slice(0, -1);
	if (prior.length < 2) return current >= 2 * counts[counts.length - 2];
	const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
	const sigma = Math.sqrt(
		prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length,
	);
	return last > Math.max(2 * sigma, JUMP_MIN_DELTA);
}

function statusRank(status: ThreatStatus) {
	return [
		"overhead",
		"approaching",
		"passing",
		"uncertain",
		"stationary",
		"distant",
	].indexOf(status);
}

export function summarizeTracks(
	times: number[],
	framesStorms: DetectedStorm[][],
	target: LatLon,
): TrackSummary[] {
	const latestIndex = framesStorms.length - 1;
	if (latestIndex < 0) return [];
	const latest = framesStorms[latestIndex];
	const motions = latest.map(({ snapshot }) => {
		const history: { t: number; snapshot: StormSnapshot }[] = [];
		const start = Math.max(0, latestIndex - 5);
		for (let i = start; i <= latestIndex; i++) {
			const match = framesStorms[i].find(
				(s) => s.snapshot.trackId === snapshot.trackId,
			);
			if (match) history.push({ t: times[i], snapshot: match.snapshot });
		}
		const origin: LatLon = { lat: snapshot.lat, lon: snapshot.lon };
		const samples = framesStorms
			.slice(start, latestIndex + 1)
			.flatMap((storms) =>
				storms.flatMap((s) =>
					s.snapshot.trackId === snapshot.trackId && s.motion ? [s.motion] : [],
				),
			);
		const recentMotion = framesStorms
			.slice(Math.max(0, latestIndex - 1))
			.some((storms) =>
				storms.some((s) => s.snapshot.trackId === snapshot.trackId && s.motion),
			);
		const velocity = samples.length
			? stableVelocity(samples)
			: { vx: 0, vy: 0, count: 0, consistent: false };
		const tracked = velocity.consistent && recentMotion;
		return { snapshot, history, origin, velocity, tracked };
	});
	const summaries = motions.map(
		({ snapshot, history, origin, velocity, tracked }) => {
			const { vx, vy } = velocity;
			const speedKmh = Math.hypot(vx, vy);
			const headingDeg = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
			const previous = history.length >= 2 ? history[history.length - 2] : null;
			const minutesBetween = previous
				? (times[latestIndex] - previous.t) / 60_000
				: 10;
			const coolingRateK = previous
				? ((snapshot.minBrightnessTempK -
						previous.snapshot.minBrightnessTempK) *
						10) /
					minutesBetween
				: 0;
			const flashTrend = previous
				? snapshot.flashCount - previous.snapshot.flashCount
				: 0;

			const radiusKm = Math.sqrt(snapshot.areaKm2 / Math.PI);
			const relative = toLocalKm(target, origin);
			const vMin = { x: vx / 60, y: vy / 60 };
			const vSquared = vMin.x ** 2 + vMin.y ** 2;
			const tClosest =
				vSquared > 0
					? Math.min(
							FORECAST_MINUTES,
							Math.max(
								0,
								-(relative.x * vMin.x + relative.y * vMin.y) / vSquared,
							),
						)
					: 0;
			const closestApproachKm = Math.hypot(
				relative.x + vMin.x * tClosest,
				relative.y + vMin.y * tClosest,
			);
			const distance = distanceKm(target, origin);
			const reach = radiusKm + 5;
			let etaMinutes: number | null = null;
			if (distance <= radiusKm) {
				etaMinutes = 0;
			} else if (tracked && vSquared > 0) {
				const a = vSquared;
				const b = 2 * (relative.x * vMin.x + relative.y * vMin.y);
				const c = relative.x ** 2 + relative.y ** 2 - reach * reach;
				const disc = b * b - 4 * a * c;
				if (disc >= 0) {
					const t = (-b - Math.sqrt(disc)) / (2 * a);
					if (t >= 0 && t <= FORECAST_MINUTES) etaMinutes = Math.round(t);
				}
			}

			let status: ThreatStatus = "distant";
			if (distance <= radiusKm) status = "overhead";
			else if (!tracked) status = "uncertain";
			else if (speedKmh < 5) status = "stationary";
			else if (etaMinutes !== null) status = "approaching";
			else if (closestApproachKm <= radiusKm + 30 && tClosest > 0)
				status = "passing";

			const forecast = [];
			if (tracked && speedKmh >= 5) {
				for (let m = 15; m <= FORECAST_MINUTES; m += 15) {
					const p = destination(origin, headingDeg, (speedKmh * m) / 60);
					forecast.push({ minutes: m, lon: p.lon, lat: p.lat });
				}
			}

			return {
				trackId: snapshot.trackId,
				severity: snapshot.severity,
				status,
				lon: snapshot.lon,
				lat: snapshot.lat,
				areaKm2: snapshot.areaKm2,
				radiusKm: Math.round(radiusKm),
				minBrightnessTempK: snapshot.minBrightnessTempK,
				maxHeightM: snapshot.maxHeightM,
				flashCount: snapshot.flashCount,
				flashTrend,
				coolingRateK: Math.round(coolingRateK * 10) / 10,
				speedKmh: Math.round(speedKmh),
				headingDeg: Math.round(headingDeg),
				distanceKm: Math.round(distance),
				bearingFromTargetDeg: Math.round(bearingDeg(target, origin)),
				closestApproachKm: Math.round(closestApproachKm),
				closestApproachMinutes: Math.round(tClosest),
				etaMinutes,
				motionInferred: !tracked,
				motionSamples: velocity.count,
				lightningJump: detectLightningJump(
					history.map((h) => h.snapshot.flashCount),
				),
				overshootingTop:
					snapshot.overshootDepthK >= OVERSHOOT_MIN_DEPTH_K &&
					snapshot.minBrightnessTempK <= OVERSHOOT_MAX_TEMP_K,
				overshootDepthK: snapshot.overshootDepthK,
				maxRainRateMmh: snapshot.maxRainRateMmh,
				history: history.map(
					(h) => [h.snapshot.lon, h.snapshot.lat] as [number, number],
				),
				forecast,
			} satisfies TrackSummary;
		},
	);

	return summaries.sort(
		(a, b) =>
			statusRank(a.status) - statusRank(b.status) ||
			(a.etaMinutes ?? 999) - (b.etaMinutes ?? 999) ||
			a.distanceKm - b.distanceKm,
	);
}
