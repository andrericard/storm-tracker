import maplibregl, {
	type ExpressionSpecification,
	type GeoJSONSource,
	type Map as MapLibreMap,
	type MapMouseEvent,
	type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	BRIGHTNESS_TEMP_STOPS,
	cellsToGeoJSON,
	EMPTY_COLLECTION,
	flashesToGeoJSON,
	rangeRingsToGeoJSON,
	stormsToGeoJSON,
	tracksToGeoJSON,
} from "#/lib/map-data";
import type { Frame, FramesResponse, LatLon } from "#/lib/storm-types";

const BASEMAP_STYLE =
	"https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LABEL_FONT = ["Open Sans Bold"];

export interface MapSettings {
	clouds: boolean;
	lowClouds: boolean;
	lightning: boolean;
	tracks: boolean;
	exaggeration: number;
}

export interface FlyToRequest extends LatLon {
	key: number;
}

interface StormMapProps {
	data: FramesResponse | undefined;
	frame: Frame | undefined;
	target: LatLon;
	settings: MapSettings;
	picking: boolean;
	selectedTrackId: number | null;
	flyTo: FlyToRequest | null;
	onPick: (position: LatLon) => void;
	onSelectTrack: (trackId: number | null) => void;
}

const LOW_CLOUD_LIMIT_K = 250;
const CLOUD_BASE_M = 1500;

function colorExpression(): ExpressionSpecification {
	return [
		"interpolate",
		["linear"],
		["get", "bt"],
		...BRIGHTNESS_TEMP_STOPS.flat(),
	] as ExpressionSpecification;
}

function setData(map: MapLibreMap, source: string, data: GeoJSON.GeoJSON) {
	(map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
}

function addLayers(map: MapLibreMap) {
	for (const id of ["rings", "clouds", "storms", "tracks", "flashes"]) {
		map.addSource(id, { type: "geojson", data: EMPTY_COLLECTION });
	}

	map.addLayer({
		id: "rings-line",
		type: "line",
		source: "rings",
		filter: ["==", ["geometry-type"], "LineString"],
		paint: {
			"line-color": "#94a3b8",
			"line-opacity": 0.35,
			"line-width": 1,
			"line-dasharray": [2, 3],
		},
	});
	map.addLayer({
		id: "clouds-3d",
		type: "fill-extrusion",
		source: "clouds",
		paint: {
			"fill-extrusion-color": colorExpression(),
			"fill-extrusion-opacity": 0.85,
			"fill-extrusion-height": 0,
			"fill-extrusion-base": 0,
		},
	});
	map.addLayer({
		id: "storm-fill",
		type: "fill",
		source: "storms",
		filter: ["==", ["geometry-type"], "Polygon"],
		paint: { "fill-color": ["get", "color"], "fill-opacity": 0.04 },
	});
	map.addLayer({
		id: "storm-outline",
		type: "line",
		source: "storms",
		filter: ["==", ["geometry-type"], "Polygon"],
		paint: {
			"line-color": ["get", "color"],
			"line-width": 1.5,
			"line-opacity": 0.9,
		},
	});
	map.addLayer({
		id: "track-history",
		type: "line",
		source: "tracks",
		filter: ["==", ["get", "kind"], "history"],
		layout: { "line-cap": "round", "line-join": "round" },
		paint: { "line-color": ["get", "color"], "line-width": 2.5 },
	});
	map.addLayer({
		id: "track-forecast",
		type: "line",
		source: "tracks",
		filter: ["==", ["get", "kind"], "forecast"],
		layout: { "line-cap": "round" },
		paint: {
			"line-color": ["get", "color"],
			"line-width": 2,
			"line-dasharray": [1.5, 2],
			"line-opacity": 0.85,
		},
	});
	map.addLayer({
		id: "track-ticks",
		type: "circle",
		source: "tracks",
		filter: ["==", ["get", "kind"], "tick"],
		paint: {
			"circle-radius": 3.5,
			"circle-color": "#0b0f17",
			"circle-stroke-color": ["get", "color"],
			"circle-stroke-width": 2,
		},
	});
	map.addLayer({
		id: "track-tick-labels",
		type: "symbol",
		source: "tracks",
		filter: ["==", ["get", "kind"], "tick"],
		layout: {
			"text-field": ["get", "label"],
			"text-font": LABEL_FONT,
			"text-size": 10,
			"text-offset": [0, 1.1],
		},
		paint: {
			"text-color": "#e2e8f0",
			"text-halo-color": "#0b0f17",
			"text-halo-width": 1.5,
		},
	});
	map.addLayer({
		id: "flash-glow",
		type: "circle",
		source: "flashes",
		paint: {
			"circle-radius": 7,
			"circle-color": "#fde047",
			"circle-opacity": 0.18,
			"circle-blur": 1,
		},
	});
	map.addLayer({
		id: "flash-core",
		type: "circle",
		source: "flashes",
		paint: {
			"circle-radius": 1.8,
			"circle-color": "#fffbeb",
			"circle-stroke-color": "#facc15",
			"circle-stroke-width": 0.8,
		},
	});
	map.addLayer({
		id: "storm-labels",
		type: "symbol",
		source: "storms",
		filter: ["==", ["geometry-type"], "Point"],
		layout: {
			"text-field": ["get", "label"],
			"text-font": LABEL_FONT,
			"text-size": 11,
			"text-allow-overlap": false,
		},
		paint: {
			"text-color": ["get", "color"],
			"text-halo-color": "#0b0f17",
			"text-halo-width": 1.8,
		},
	});
	map.addLayer({
		id: "rings-labels",
		type: "symbol",
		source: "rings",
		filter: ["==", ["geometry-type"], "Point"],
		layout: {
			"text-field": ["get", "label"],
			"text-font": LABEL_FONT,
			"text-size": 10,
		},
		paint: {
			"text-color": "#94a3b8",
			"text-halo-color": "#0b0f17",
			"text-halo-width": 1.2,
		},
	});
}

function createTargetElement() {
	const element = document.createElement("div");
	element.className = "relative size-4";
	element.innerHTML =
		'<span class="absolute inset-0 animate-ping rounded-full bg-sky-400/60"></span><span class="absolute inset-0.5 rounded-full border-2 border-white bg-sky-500"></span>';
	return element;
}

export function StormMap({
	data,
	frame,
	target,
	settings,
	picking,
	selectedTrackId,
	flyTo,
	onPick,
	onSelectTrack,
}: StormMapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const markerRef = useRef<Marker | null>(null);
	const pickingRef = useRef(picking);
	const handlersRef = useRef({ onPick, onSelectTrack });
	const initialCenterRef = useRef(target);
	const [loaded, setLoaded] = useState(false);

	pickingRef.current = picking;
	handlersRef.current = { onPick, onSelectTrack };

	useEffect(() => {
		if (!containerRef.current) return;
		const center = initialCenterRef.current;
		const map = new maplibregl.Map({
			container: containerRef.current,
			style: BASEMAP_STYLE,
			center: [center.lon, center.lat],
			zoom: 6.2,
			pitch: 55,
			bearing: -12,
			maxPitch: 80,
			canvasContextAttributes: { antialias: true },
		});
		map.addControl(
			new maplibregl.NavigationControl({ visualizePitch: true }),
			"bottom-right",
		);
		map.addControl(
			new maplibregl.ScaleControl({ unit: "metric" }),
			"bottom-left",
		);
		map.on("load", () => {
			addLayers(map);
			setLoaded(true);
		});
		map.on("click", (event: MapMouseEvent) => {
			if (pickingRef.current) {
				handlersRef.current.onPick({
					lat: event.lngLat.lat,
					lon: event.lngLat.lng,
				});
				return;
			}
			const [feature] = map.queryRenderedFeatures(event.point, {
				layers: ["storm-fill"],
			});
			handlersRef.current.onSelectTrack(
				feature ? Number(feature.properties.trackId) : null,
			);
		});
		map.on("mouseenter", "storm-fill", () => {
			if (!pickingRef.current) map.getCanvas().style.cursor = "pointer";
		});
		map.on("mouseleave", "storm-fill", () => {
			if (!pickingRef.current) map.getCanvas().style.cursor = "";
		});
		mapRef.current = map;
		return () => {
			map.remove();
			mapRef.current = null;
		};
	}, []);

	const cells = useMemo(
		() => (data && frame ? cellsToGeoJSON(data.grid, frame) : EMPTY_COLLECTION),
		[data, frame],
	);
	const flashes = useMemo(
		() => (frame ? flashesToGeoJSON(frame) : EMPTY_COLLECTION),
		[frame],
	);
	const storms = useMemo(
		() => (frame ? stormsToGeoJSON(frame) : EMPTY_COLLECTION),
		[frame],
	);
	const tracks = useMemo(
		() =>
			data ? tracksToGeoJSON(data.tracks, selectedTrackId) : EMPTY_COLLECTION,
		[data, selectedTrackId],
	);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		setData(map, "clouds", cells);
		setData(map, "flashes", flashes);
		setData(map, "storms", storms);
	}, [loaded, cells, flashes, storms]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		setData(map, "tracks", tracks);
	}, [loaded, tracks]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		setData(map, "rings", rangeRingsToGeoJSON(target));
		markerRef.current?.remove();
		markerRef.current = new maplibregl.Marker({
			element: createTargetElement(),
		})
			.setLngLat([target.lon, target.lat])
			.addTo(map);
	}, [loaded, target]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		const visibility = (visible: boolean) => (visible ? "visible" : "none");
		map.setLayoutProperty(
			"clouds-3d",
			"visibility",
			visibility(settings.clouds),
		);
		for (const id of ["flash-glow", "flash-core"]) {
			map.setLayoutProperty(id, "visibility", visibility(settings.lightning));
		}
		for (const id of [
			"track-history",
			"track-forecast",
			"track-ticks",
			"track-tick-labels",
		]) {
			map.setLayoutProperty(id, "visibility", visibility(settings.tracks));
		}
		map.setFilter(
			"clouds-3d",
			settings.lowClouds ? null : ["<", ["get", "bt"], LOW_CLOUD_LIMIT_K],
		);
		const exaggeration = settings.exaggeration;
		map.setPaintProperty("clouds-3d", "fill-extrusion-height", [
			"*",
			["get", "h"],
			exaggeration,
		]);
		map.setPaintProperty("clouds-3d", "fill-extrusion-base", [
			"*",
			[
				"max",
				CLOUD_BASE_M,
				[
					"-",
					["get", "h"],
					[
						"interpolate",
						["linear"],
						["get", "bt"],
						200,
						16000,
						225,
						6000,
						250,
						2500,
						270,
						1200,
					],
				],
			],
			exaggeration,
		]);
	}, [loaded, settings]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		const width: ExpressionSpecification = [
			"case",
			["==", ["get", "trackId"], selectedTrackId ?? -1],
			3.5,
			1.5,
		];
		map.setPaintProperty("storm-outline", "line-width", width);
		map.setPaintProperty("storm-fill", "fill-opacity", [
			"case",
			["==", ["get", "trackId"], selectedTrackId ?? -1],
			0.16,
			0.04,
		]);
	}, [loaded, selectedTrackId]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.getCanvas().style.cursor = picking ? "crosshair" : "";
	}, [picking]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !flyTo) return;
		map.flyTo({
			center: [flyTo.lon, flyTo.lat],
			zoom: Math.max(map.getZoom(), 7),
			duration: 1200,
		});
	}, [flyTo]);

	return (
		<div className="absolute inset-0">
			<div ref={containerRef} className="h-full w-full" />
		</div>
	);
}
