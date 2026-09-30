export type ColorStop = [number, string, number?];

export interface ColorScale {
	stops: ColorStop[];
	rgba: (value: number) => [number, number, number, number];
	cssGradient: string;
}

function parseHex(hex: string) {
	return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

export function colorScale(stops: ColorStop[]): ColorScale {
	const parsed = stops.map(([value, hex, alpha]) => ({
		value,
		rgb: parseHex(hex),
		alpha: alpha ?? 1,
	}));
	const first = parsed[0];
	const last = parsed[parsed.length - 1];
	const rgba = (value: number): [number, number, number, number] => {
		if (!(value > first.value)) {
			return [first.rgb[0], first.rgb[1], first.rgb[2], first.alpha];
		}
		for (let i = 1; i < parsed.length; i++) {
			if (value <= parsed[i].value) {
				const a = parsed[i - 1];
				const b = parsed[i];
				const t = (value - a.value) / (b.value - a.value);
				return [
					a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t,
					a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t,
					a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t,
					a.alpha + (b.alpha - a.alpha) * t,
				];
			}
		}
		return [last.rgb[0], last.rgb[1], last.rgb[2], last.alpha];
	};
	const span = last.value - first.value;
	const cssGradient = `linear-gradient(90deg, ${parsed
		.map(
			(s) =>
				`rgba(${s.rgb.join(",")},${s.alpha}) ${((s.value - first.value) / span) * 100}%`,
		)
		.join(", ")})`;
	return { stops, rgba, cssGradient };
}
