import { useTranslation } from "#/lib/i18n";
import type { SimeparForecast } from "#/lib/storm-types";
import { cn } from "#/lib/utils";

export function SimeparForecastCard({
	forecast,
}: {
	forecast: SimeparForecast;
}) {
	const { t } = useTranslation();
	return (
		<div className="pointer-events-auto flex max-h-80 min-h-0 w-64 shrink-0 flex-col rounded-xl border bg-background/85 shadow-2xl backdrop-blur-md">
			<a
				href={forecast.url}
				target="_blank"
				rel="noreferrer"
				className="truncate px-4 pt-3 pb-2 text-sm hover:underline"
			>
				{t("Forecast")} · {forecast.city}
			</a>
			<div className="overflow-y-auto px-2 pb-2 text-xs tabular-nums">
				{forecast.hours.map((hour, i) => (
					<div key={`${hour.day}-${hour.time}`}>
						{hour.day !== forecast.hours[i - 1]?.day && (
							<div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
								{hour.day}
							</div>
						)}
						<div
							title={hour.condition}
							className={cn(
								"grid grid-cols-4 rounded px-2 py-0.5",
								hour.rainMm >= 0.5 && hour.rainChance >= 50
									? "bg-sky-500/15 text-sky-100"
									: "text-muted-foreground",
							)}
						>
							<span>{hour.time}</span>
							<span className="text-right">{hour.tempC}°C</span>
							<span className="text-right">{hour.rainMm} mm</span>
							<span className="text-right">{hour.rainChance}%</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
