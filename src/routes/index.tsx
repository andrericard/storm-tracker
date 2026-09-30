import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LayerControls } from "#/components/layer-controls";
import {
	type FlyToRequest,
	type MapSettings,
	StormMap,
} from "#/components/storm-map";
import { StormPanel } from "#/components/storm-panel";
import { Timeline } from "#/components/timeline";
import { TooltipProvider } from "#/components/ui/tooltip";
import type { FramesResponse, LatLon } from "#/lib/storm-types";

const DEFAULT_TARGET = { lat: -23.7661, lon: -53.3206, name: "Umuarama, PR" };
const FRAME_COUNT = 6;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const PLAYBACK_INTERVAL_MS = 700;

interface SearchParams {
	lat?: number;
	lon?: number;
}

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): SearchParams => {
		const lat = Number(search.lat);
		const lon = Number(search.lon);
		return Number.isFinite(lat) &&
			Number.isFinite(lon) &&
			search.lat !== undefined
			? { lat, lon }
			: {};
	},
	component: StormTrackerPage,
});

async function fetchFrames(target: LatLon): Promise<FramesResponse> {
	const params = new URLSearchParams({
		lat: target.lat.toFixed(4),
		lon: target.lon.toFixed(4),
		frames: String(FRAME_COUNT),
	});
	const response = await fetch(`/api/frames?${params}`);
	const body = await response.json();
	if (!response.ok)
		throw new Error(body.error ?? "Failed to load GOES-19 data");
	return body;
}

function StormTrackerPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const target: LatLon =
		search.lat !== undefined && search.lon !== undefined
			? { lat: search.lat, lon: search.lon }
			: DEFAULT_TARGET;
	const locationName =
		search.lat !== undefined && search.lon !== undefined
			? `${target.lat.toFixed(3)}, ${target.lon.toFixed(3)}`
			: DEFAULT_TARGET.name;

	const query = useQuery({
		queryKey: ["frames", target.lat, target.lon],
		queryFn: () => fetchFrames(target),
		refetchInterval: REFRESH_INTERVAL_MS,
		staleTime: REFRESH_INTERVAL_MS - 30_000,
		placeholderData: keepPreviousData,
		retry: 1,
	});
	const data = query.data;
	const frameTotal = data?.frames.length ?? 0;

	const [frameIndex, setFrameIndex] = useState(0);
	const [followLive, setFollowLive] = useState(true);
	const [playing, setPlaying] = useState(false);
	const [picking, setPicking] = useState(false);
	const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
	const [flyTo, setFlyTo] = useState<FlyToRequest | null>(null);
	const [settings, setSettings] = useState<MapSettings>({
		view: "2d",
		clouds: true,
		lowClouds: false,
		opacity: 0.8,
		lightning: true,
		tracks: true,
		rain: false,
		overlay: "none",
		exaggeration: 5,
	});
	const flyKey = useRef(0);

	useEffect(() => {
		if (frameTotal && followLive) setFrameIndex(frameTotal - 1);
	}, [frameTotal, followLive]);

	useEffect(() => {
		if (!playing || frameTotal < 2) return;
		const timer = window.setInterval(() => {
			setFrameIndex((index) => (index + 1) % frameTotal);
		}, PLAYBACK_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [playing, frameTotal]);

	const changeFrame = (index: number) => {
		setPlaying(false);
		setFrameIndex(index);
		setFollowLive(index === frameTotal - 1);
	};

	const togglePlay = () => {
		if (playing) {
			setPlaying(false);
			setFrameIndex(frameTotal - 1);
			setFollowLive(true);
		} else {
			setFollowLive(false);
			setPlaying(true);
		}
	};

	const pickTarget = (position: LatLon) => {
		setPicking(false);
		setSelectedTrackId(null);
		navigate({
			search: {
				lat: Math.round(position.lat * 1e4) / 1e4,
				lon: Math.round(position.lon * 1e4) / 1e4,
			},
		});
		flyKey.current += 1;
		setFlyTo({ ...position, key: flyKey.current });
	};

	const focusTrack = (trackId: number | null) => {
		setSelectedTrackId(trackId);
		const track = data?.tracks.find((t) => t.trackId === trackId);
		if (track) {
			flyKey.current += 1;
			setFlyTo({ lat: track.lat, lon: track.lon, key: flyKey.current });
		}
	};

	return (
		<TooltipProvider delayDuration={150}>
			<main className="fixed inset-0 overflow-hidden bg-[#0b0f17]">
				<StormMap
					data={data}
					frame={data?.frames[Math.min(frameIndex, frameTotal - 1)]}
					target={target}
					settings={settings}
					picking={picking}
					selectedTrackId={selectedTrackId}
					flyTo={flyTo}
					onPick={pickTarget}
					onSelectTrack={setSelectedTrackId}
				/>
				<div className="pointer-events-none absolute top-4 bottom-4 left-4 flex flex-col">
					<StormPanel
						data={data}
						locationName={locationName}
						isLoading={query.isLoading}
						isFetching={query.isFetching}
						error={query.error}
						picking={picking}
						selectedTrackId={selectedTrackId}
						onTogglePicking={() => setPicking((value) => !value)}
						onRefresh={() => query.refetch()}
						onSelectTrack={(track) => focusTrack(track.trackId)}
					/>
				</div>
				<div className="pointer-events-none absolute top-4 right-4">
					<LayerControls
						settings={settings}
						model={data?.environment?.model ?? null}
						onChange={setSettings}
					/>
				</div>
				{data && (
					<div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
						<Timeline
							frames={data.frames}
							index={Math.min(frameIndex, frameTotal - 1)}
							playing={playing}
							onIndexChange={changeFrame}
							onTogglePlay={togglePlay}
						/>
					</div>
				)}
			</main>
		</TooltipProvider>
	);
}
