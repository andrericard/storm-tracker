import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildFrames } from "#/server/goes/frames";

const target = {
	lat: Number(process.env.TARGET_LAT ?? -23.7661),
	lon: Number(process.env.TARGET_LON ?? -53.3206),
};
const frames = Number(process.env.FRAME_COUNT ?? 6);
const radiusKm = Number(process.env.RADIUS_KM ?? 400);
const output = resolve(process.argv[2] ?? "dist/client/data/frames.json");

const data = await buildFrames(target, frames, radiusKm);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(data));
console.log(
	`Wrote ${output}: ${data.frames.length} frames, ${data.tracks.length} tracks, GFS ${data.environment?.model.cycle ?? "n/a"}`,
);
