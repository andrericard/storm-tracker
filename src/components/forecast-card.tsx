import { useTranslation } from "#/lib/i18n";
import type { PointForecast, RainForecast } from "#/lib/storm-types";
import { cn } from "#/lib/utils";

const LIKELY = 70;
const POSSIBLE = 30;

const likely = (forecast: RainForecast | null) =>
	!!forecast && forecast.rainChance >= LIKELY;

function Chance({ forecast }: { forecast: RainForecast | null }) {
	if (!forecast) return <span className="text-right">-</span>;
	return (
		<span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
			<span
				className={cn(
					forecast.rainMm >= 0.5
						? "text-foreground"
						: "text-muted-foreground/60",
				)}
			>
				{forecast.rainMm}
			</span>
			<span
				className={cn(
					"w-10 text-right",
					forecast.rainChance >= LIKELY
						? "font-semibold text-sky-300"
						: forecast.rainChance >= POSSIBLE
							? "text-foreground"
							: "text-muted-foreground/60",
				)}
			>
				{forecast.rainChance}%
			</span>
		</span>
	);
}

export function ForecastCard({ forecast }: { forecast: PointForecast }) {
	const { t, language } = useTranslation();
	const hasSimepar = !!forecast.simeparUrl;
	const columns = hasSimepar
		? "grid-cols-[2.75rem_1fr_1fr]"
		: "grid-cols-[2.75rem_1fr]";
	const dayLabel = (time: string) =>
		new Date(`${time.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
			language === "pt" ? "pt-BR" : "en-US",
			{ weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" },
		);
	return (
		<div className="pointer-events-auto flex max-h-80 min-h-0 w-64 flex-col rounded-xl border bg-background/85 shadow-2xl backdrop-blur-md">
			<div className="shrink-0 truncate px-4 pt-3 pb-2 text-sm">
				{t("Rain in")}{" "}
				{forecast.simeparUrl ? (
					<a
						href={forecast.simeparUrl}
						target="_blank"
						rel="noreferrer"
						className="hover:underline"
					>
						{forecast.city}
					</a>
				) : (
					forecast.city
				)}
			</div>
			<div
				className={cn(
					"grid shrink-0 px-4 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground",
					columns,
				)}
			>
				<span />
				{hasSimepar && <span className="text-right">Simepar</span>}
				<span className="text-right">ECMWF</span>
			</div>
			<div className="min-h-0 overflow-y-auto px-2 pb-2 text-sm tabular-nums">
				{forecast.hours.map((hour, i) => (
					<div key={hour.time}>
						{hour.time.slice(0, 10) !==
							forecast.hours[i - 1]?.time.slice(0, 10) && (
							<div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
								{dayLabel(hour.time)}
							</div>
						)}
						<div
							title={hour.condition ?? undefined}
							className={cn(
								"grid rounded px-2 py-0.5",
								columns,
								(hasSimepar ? likely(hour.simepar) : true) &&
									likely(hour.ecmwf) &&
									"bg-sky-500/20",
							)}
						>
							<span className="text-muted-foreground">
								{hour.time.slice(11, 16)}
							</span>
							{hasSimepar && <Chance forecast={hour.simepar} />}
							<Chance forecast={hour.ecmwf} />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
