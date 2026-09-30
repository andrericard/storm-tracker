import { existsSync } from "node:fs";
import {
	mkdir,
	readdir,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const BUCKET_URL = "https://noaa-goes19.s3.amazonaws.com";
const CACHE_DIR = join(tmpdir(), "storm-tracker-cache");
const CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const RECENT_LISTING_TTL_MS = 60 * 1000;

export interface S3Object {
	key: string;
	start: number;
	stamp: string;
}

const listingCache = new Map<string, { at: number; objects: S3Object[] }>();
const downloads = new Map<string, Promise<string>>();
let lastCleanup = 0;

export function parseStart(key: string) {
	const match = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)/.exec(key);
	if (!match) return null;
	const [, year, doy, hour, minute, second, tenth] = match.map(Number);
	const start =
		Date.UTC(year, 0, 1) +
		(doy - 1) * 86_400_000 +
		hour * 3_600_000 +
		minute * 60_000 +
		second * 1000 +
		tenth * 100;
	return { start, stamp: match[0].slice(2) };
}

function hourPrefix(product: string, time: number) {
	const date = new Date(time);
	const year = date.getUTCFullYear();
	const doy = Math.floor((time - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
	const hour = String(date.getUTCHours()).padStart(2, "0");
	return `${product}/${year}/${String(doy).padStart(3, "0")}/${hour}/`;
}

async function listPrefix(prefix: string) {
	const objects: S3Object[] = [];
	let token: string | undefined;
	do {
		const params = new URLSearchParams({ "list-type": "2", prefix });
		if (token) params.set("continuation-token", token);
		const response = await fetch(`${BUCKET_URL}/?${params}`);
		if (!response.ok) {
			throw new Error(`S3 listing failed for ${prefix}: ${response.status}`);
		}
		const xml = await response.text();
		for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
			const parsed = parseStart(match[1]);
			if (parsed) objects.push({ key: match[1], ...parsed });
		}
		token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1];
	} while (token);
	return objects;
}

async function listHour(product: string, time: number) {
	const prefix = hourPrefix(product, time);
	const cached = listingCache.get(prefix);
	const isCurrentHour = Date.now() - time < 70 * 60 * 1000;
	if (
		cached &&
		(!isCurrentHour || Date.now() - cached.at < RECENT_LISTING_TTL_MS)
	) {
		return cached.objects;
	}
	const objects = await listPrefix(prefix);
	listingCache.set(prefix, { at: Date.now(), objects });
	return objects;
}

export async function listRecent(
	product: string,
	since: number,
	filter: (key: string) => boolean = () => true,
) {
	const hours: number[] = [];
	const now = Date.now();
	for (let t = since - (since % 3_600_000); t <= now; t += 3_600_000) {
		hours.push(t);
	}
	const lists = await Promise.all(hours.map((t) => listHour(product, t)));
	return lists
		.flat()
		.filter((o) => o.start >= since && filter(o.key))
		.sort((a, b) => a.start - b.start);
}

async function cleanupCache() {
	if (Date.now() - lastCleanup < 10 * 60 * 1000) return;
	lastCleanup = Date.now();
	const files = await readdir(CACHE_DIR).catch(() => []);
	await Promise.all(
		files.map(async (file) => {
			const path = join(CACHE_DIR, file);
			const info = await stat(path).catch(() => null);
			if (info && Date.now() - info.mtimeMs > CACHE_MAX_AGE_MS) {
				await unlink(path).catch(() => undefined);
			}
		}),
	);
}

export function download(key: string) {
	const path = join(CACHE_DIR, basename(key));
	if (existsSync(path)) return Promise.resolve(path);
	const pending = downloads.get(key);
	if (pending) return pending;
	const task = (async () => {
		await mkdir(CACHE_DIR, { recursive: true });
		await cleanupCache();
		const response = await fetch(`${BUCKET_URL}/${key}`);
		if (!response.ok) {
			throw new Error(`Download failed for ${key}: ${response.status}`);
		}
		const buffer = new Uint8Array(await response.arrayBuffer());
		const partial = `${path}.${process.pid}.part`;
		await writeFile(partial, buffer);
		await rename(partial, path);
		return path;
	})().finally(() => downloads.delete(key));
	downloads.set(key, task);
	return task;
}

export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
) {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await fn(items[index], index);
			}
		},
	);
	await Promise.all(workers);
	return results;
}
