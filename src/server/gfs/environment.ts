import type {
	EnvironmentResponse,
	GridSpec,
	LatLon,
	StormEnvironment,
	TornadoRisk,
	TrackSummary,
} from "#/lib/storm-types";
import type { GfsFieldName, GfsFields } from "#/server/gfs/fetch";

const LCL_M_PER_K = 125;
const SHEAR_TOP_M = 6000;
const SRH1_TOP_M = 1000;
const SRH3_TOP_M = 3000;

interface WindLevel {
	heightAgl: number;
	u: number;
	v: number;
}

interface Motion {
	u: number;
	v: number;
}

function sample(fields: GfsFields, name: GfsFieldName, point: LatLon) {
	const { grid } = fields;
	const x = (point.lon - grid.west) / grid.step;
	const y = (point.lat - grid.south) / grid.step;
	const c0 = Math.min(grid.cols - 2, Math.max(0, Math.floor(x)));
	const r0 = Math.min(grid.rows - 2, Math.max(0, Math.floor(y)));
	const tx = Math.min(1, Math.max(0, x - c0));
	const ty = Math.min(1, Math.max(0, y - r0));
	const data = fields.fields[name];
	const at = (r: number, c: number) => data[r * grid.cols + c];
	const top = at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx;
	const bottom = at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx;
	return top * (1 - ty) + bottom * ty;
}

function windProfile(fields: GfsFields, point: LatLon): WindLevel[] {
	const surface = sample(fields, "surfaceHeight", point);
	const levels: WindLevel[] = [
		{
			heightAgl: 10,
			u: sample(fields, "u10m", point),
			v: sample(fields, "v10m", point),
		},
	];
	const pressureLevels = ["925", "850", "700", "500"] as const;
	for (const level of pressureLevels) {
		const heightAgl = sample(fields, `h${level}`, point) - surface;
		if (heightAgl <= levels[levels.length - 1].heightAgl) continue;
		levels.push({
			heightAgl,
			u: sample(fields, `u${level}`, point),
			v: sample(fields, `v${level}`, point),
		});
	}
	return levels;
}

function windAt(profile: WindLevel[], heightAgl: number): Motion {
	if (heightAgl <= profile[0].heightAgl) return profile[0];
	for (let i = 1; i < profile.length; i++) {
		if (heightAgl <= profile[i].heightAgl) {
			const a = profile[i - 1];
			const b = profile[i];
			const t = (heightAgl - a.heightAgl) / (b.heightAgl - a.heightAgl);
			return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t };
		}
	}
	return profile[profile.length - 1];
}

function bulkShear(profile: WindLevel[], topM: number) {
	const top = windAt(profile, topM);
	const bottom = profile[0];
	return Math.hypot(top.u - bottom.u, top.v - bottom.v);
}

function helicity(profile: WindLevel[], motion: Motion, topM: number) {
	const layers = profile.filter((level) => level.heightAgl < topM);
	layers.push({ heightAgl: topM, ...windAt(profile, topM) });
	let total = 0;
	for (let i = 1; i < layers.length; i++) {
		const a = layers[i - 1];
		const b = layers[i];
		total +=
			(b.u - motion.u) * (a.v - motion.v) - (a.u - motion.u) * (b.v - motion.v);
	}
	return total;
}

function meanWind(profile: WindLevel[], topM: number): Motion {
	const steps = 12;
	let u = 0;
	let v = 0;
	for (let i = 0; i <= steps; i++) {
		const wind = windAt(profile, (i / steps) * topM);
		u += wind.u;
		v += wind.v;
	}
	return { u: u / (steps + 1), v: v / (steps + 1) };
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function significantTornadoParameter(
	cape: number,
	lclM: number,
	srh1: number,
	shear6: number,
) {
	const capeTerm = cape / 1500;
	const lclTerm = clamp((2000 - lclM) / 1000, 0, 1);
	const srhTerm = Math.abs(srh1) / 150;
	const shearTerm = shear6 < 12.5 ? 0 : shear6 > 30 ? 1.5 : shear6 / 20;
	return capeTerm * lclTerm * srhTerm * shearTerm;
}

function riskFor(stp: number, cape: number): TornadoRisk {
	if (cape < 100) return "none";
	if (stp >= 1) return "high";
	if (stp >= 0.4) return "moderate";
	if (stp >= 0.1) return "low";
	return "none";
}

export function environmentAt(
	fields: GfsFields,
	point: LatLon,
	motion: Motion | null,
): StormEnvironment {
	const profile = windProfile(fields, point);
	const storm = motion ?? meanWind(profile, SHEAR_TOP_M);
	const cape = Math.max(0, sample(fields, "cape", point));
	const temperature = sample(fields, "temperature2m", point);
	const dewPoint = sample(fields, "dewPoint2m", point);
	const lclM = Math.max(0, (temperature - dewPoint) * LCL_M_PER_K);
	const shear6 = bulkShear(profile, SHEAR_TOP_M);
	const shear1 = bulkShear(profile, SRH1_TOP_M);
	const srh1 = helicity(profile, storm, SRH1_TOP_M);
	const srh3 = helicity(profile, storm, SRH3_TOP_M);
	const stp = significantTornadoParameter(cape, lclM, srh1, shear6);
	return {
		mslpHpa: Math.round(sample(fields, "mslp", point) / 10) / 10,
		capeJkg: Math.round(cape),
		cinJkg: Math.round(sample(fields, "cin", point)),
		liftedIndexK: Math.round(sample(fields, "liftedIndex", point) * 10) / 10,
		lclM: Math.round(lclM),
		shear6Ms: Math.round(shear6 * 10) / 10,
		shear1Ms: Math.round(shear1 * 10) / 10,
		srh1M2s2: Math.round(srh1),
		srh3M2s2: Math.round(srh3),
		stp: Math.round(stp * 100) / 100,
		risk: riskFor(stp, cape),
		motionFromTrack: motion !== null,
	};
}

function trackMotion(track: TrackSummary): Motion | null {
	if (track.speedKmh < 5) return null;
	const speed = track.speedKmh / 3.6;
	const heading = (track.headingDeg * Math.PI) / 180;
	return { u: speed * Math.sin(heading), v: speed * Math.cos(heading) };
}

function overlayField(fields: GfsFields, name: GfsFieldName, scale = 1) {
	return Array.from(
		fields.fields[name],
		(v) => Math.round(v * scale * 10) / 10,
	);
}

function shearField(fields: GfsFields) {
	const { grid } = fields;
	const output: number[] = [];
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			const point = {
				lat: grid.south + r * grid.step,
				lon: grid.west + c * grid.step,
			};
			output.push(
				Math.round(bulkShear(windProfile(fields, point), SHEAR_TOP_M) * 10) /
					10,
			);
		}
	}
	return output;
}

export function buildEnvironment(
	fields: GfsFields,
	target: LatLon,
	tracks: TrackSummary[],
): EnvironmentResponse {
	const nearest = tracks.find((t) => t.distanceKm <= 150 && t.speedKmh >= 5);
	const grid: GridSpec = fields.grid;
	return {
		model: fields.run,
		grid,
		fields: {
			mslp: overlayField(fields, "mslp", 0.01),
			cape: overlayField(fields, "cape"),
			shear6: shearField(fields),
			srh3: Array.from(fields.fields.helicity3km, (v) =>
				Math.round(Math.abs(v)),
			),
		},
		target: environmentAt(
			fields,
			target,
			nearest ? trackMotion(nearest) : null,
		),
	};
}

export function attachEnvironments(fields: GfsFields, tracks: TrackSummary[]) {
	for (const track of tracks) {
		track.environment = environmentAt(
			fields,
			{ lat: track.lat, lon: track.lon },
			trackMotion(track),
		);
	}
}
