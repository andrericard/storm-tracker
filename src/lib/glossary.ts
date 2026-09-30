export const GLOSSARY = {
	topTemp:
		"Temperature at the top of the cloud, from the satellite infrared band. Colder tops mean the storm reaches higher into the atmosphere and is usually stronger. Below about -60°C is a strong storm.",
	topHeight:
		"Height of the cloud top above sea level. Thunderstorms in this region reach 12–17 km.",
	flashes:
		"Lightning flashes detected by the GOES lightning mapper in the last 10 minutes, in and around this cell. More lightning means a more intense updraft.",
	area: "Ground area covered by the cold cloud tops of this cell.",
	pressure:
		"Air pressure at sea level from the GFS model. Storms and fronts usually sit in low-pressure areas; high pressure means calmer weather.",
	cape: "Convective Available Potential Energy: how much fuel the atmosphere has for thunderstorms. Under 500 J/kg is weak, 1000–2500 is strong, above 2500 is extreme.",
	cin: "Convective Inhibition: a lid that stops storms from forming. Values near 0 mean storms can start easily; below -100 they are held back until something breaks the lid.",
	liftedIndex:
		"Lifted Index: how unstable the air is. Negative values favour storms; below -4 is very unstable.",
	shear6:
		"Wind shear between the ground and 6 km: how much the wind changes with height. Above 15–20 m/s storms become organised and long-lived, and supercells become possible.",
	shear1:
		"Wind shear between the ground and 1 km. Strong low-level shear is one of the key ingredients for tornadoes.",
	srh1: "Storm-Relative Helicity 0–1 km: how much the low-level wind rotates relative to the storm's motion. This is the main tornado ingredient. In the Southern Hemisphere it is negative in favourable environments; magnitudes above 100–150 m²/s² are significant.",
	srh3: "Storm-Relative Helicity 0–3 km: rotation available to the storm in the lowest 3 km. Magnitudes above 250 m²/s² support rotating storms (supercells).",
	lcl: "Lifting Condensation Level: the height of the cloud base. Low cloud bases (under 1000 m) make tornadoes more likely because the rotation is closer to the ground.",
	stp: "Significant Tornado Parameter: combines CAPE, wind shear, helicity and cloud-base height into one number. Above 1 means the environment can support a significant tornado; 0.3–1 is marginal.",
	tornadoRisk:
		"How favourable the environment is for tornadoes, based on the Significant Tornado Parameter. This describes the environment, not an observed tornado — only Doppler radar can confirm rotation.",
	lightningJump:
		"A sudden increase in the lightning rate. It often happens 10–20 minutes before severe weather (hail, damaging wind) reaches the ground.",
	overshootingTop:
		"A spot on the cloud top that is much colder than the surrounding anvil: the updraft is so strong it punches above the top of the storm. A sign of a violent updraft.",
	rainRate:
		"Rainfall rate estimated by the satellite from cloud-top temperatures. Good for where and roughly how hard it is raining; radar is more accurate.",
	rainNow: "Estimated rainfall rate at the target location right now.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

export const OVERLAY_DESCRIPTIONS = {
	none: "No model field on the map.",
	mslp: "Sea-level pressure with isobars every 2 hPa. Lows (purple/blue) bring unsettled weather; highs (orange/red) bring calm weather.",
	cape: "Storm fuel. Warm colours mean the air has a lot of energy for thunderstorms.",
	shear6:
		"How much the wind changes between the ground and 6 km. Warm colours support organised, long-lived storms.",
	srh3: "Rotation available to storms in the lowest 3 km. Warm colours support rotating storms.",
} as const;
