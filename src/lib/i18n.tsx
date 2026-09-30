import { createContext, useContext, useEffect, useState } from "react";
export type Language = "pt" | "en";
const PT: Record<string, string> = {
	"Cloud layer": "Camada de nuvens",
	"Show warm / low clouds": "Nuvens quentes / baixas",
	"Rain rate (GOES)": "Chuva (GOES)",
	"Radar (IPMet)": "Radar (IPMet)",
	"Radar (Simepar)": "Radar (Simepar)",
	Keyed: "Recorte",
	Opacity: "Opacidade",
	"Lightning (GLM)": "Raios (GLM)",
	"Tracks & forecast": "Trajetórias e projeção",
	Off: "Desligado",
	"Air pressure": "Pressão atmosférica",
	"Storm energy (CAPE)": "Energia da tempestade (CAPE)",
	"Wind shear": "Cisalhamento do vento",
	"Rotation (helicity)": "Rotação (helicidade)",
	"Environment overlay": "Camada atmosférica",
	"Cloud opacity": "Opacidade das nuvens",
	"Vertical exaggeration": "Exagero vertical",
	"Cloud top temperature": "Temperatura do topo",
	"Radar intensity (IPMet)": "Intensidade do radar (IPMet)",
	"Radar intensity (Simepar)": "Intensidade do radar (Simepar)",
	weak: "fraca",
	moderate: "moderada",
	strong: "forte",
	severe: "severa",
	extreme: "extrema",
	"Rain rate (mm/h)": "Intensidade da chuva (mm/h)",
	"Pressure (MSL)": "Pressão ao nível do mar",
	"Shear 0-6 km": "Cisalhamento 0 a 6 km",
	"|SRH| 0-3 km (GFS)": "|SRH| 0 a 3 km (GFS)",
	Pause: "Pausar",
	Play: "Reproduzir",
	"Cloud Top Height product not yet available for this scan":
		"Altura do topo ainda indisponível nesta imagem",
	"height estimated": "altura estimada",
	flashes: "raios",
	LIVE: "ATUAL",
	"Tornado: none": "Tornado: sem sinal",
	"Tornado: low": "Tornado: baixo",
	"Tornado: moderate": "Tornado: moderado",
	"Tornado: high": "Tornado: alto",
	"Shear 0-6": "Cisalh. 0 a 6",
	"SRH 0-1": "SRH 0 a 1",
	"SRH 0-3": "SRH 0 a 3",
	"Lightning jump": "Aumento de raios",
	"Overshooting top": "Topo penetrante",
	Storm: "Tempestade",
	"of target": "do alvo",
	moving: "seguindo",
	"Top temp": "Temp. topo",
	"Top height": "Altura topo",
	Flashes: "Raios",
	Area: "Área",
	"Environment at target": "Atmosfera no alvo",
	Pressure: "Pressão",
	"Rain now": "Chuva agora",
	dry: "sem chuva",
	Refresh: "Atualizar",
	"Click the map": "Clique no mapa",
	Change: "Alterar",
	"Downloading GOES-19 data from NOAA… the first load can take a minute.":
		"Baixando dados GOES-19 da NOAA… a primeira consulta pode levar alguns minutos.",
	"active cells": "células ativas",
	"Latest scan": "Última imagem",
	"Over target": "Sobre o alvo",
	Approaching: "Aproximando-se",
	"Passing nearby": "Passando perto",
	Stationary: "Estacionária",
	"Not heading here": "Sem chegada prevista",
	"Uncertain motion": "Movimento incerto",
	"just now": "agora",
	"{time} ago": "há {time}",
	"No convective storms": "Sem tempestades convectivas",
	"Nothing with cloud tops below -38°C within {radius} km.":
		"Nenhum topo abaixo de -38°C em um raio de {radius} km.",
	"Storm #{id} is over you": "Tempestade #{id} sobre o alvo",
	"Tops at {temp}°C, {flashes} flashes in the last 10 min.":
		"Topo a {temp}°C, {flashes} raios nos últimos 10 min.",
	"Storm #{id} arriving in ~{time}":
		"Tempestade #{id}: chegada estimada em ~{time}",
	"Currently {where}, moving {direction} at {speed} km/h.":
		"A {where}, seguindo {direction} a {speed} km/h.",
	"Storm #{id} may pass nearby": "Tempestade #{id} pode passar perto",
	"Closest approach ~{distance} km in {time}.":
		"Maior aproximação a ~{distance} km em {time}.",
	"No storms heading your way": "Sem tempestades com chegada prevista",
	"Nearest active cell is {where}.": "Célula mais próxima a {where}.",
	"Not enough consistent cloud motion to estimate arrival.":
		"Movimento das nuvens ainda inconsistente para estimar chegada.",
	"{count} motion estimates": "{count} estimativas de movimento",
	"Unable to load weather data. Try again.":
		"Não foi possível carregar os dados. Tente novamente.",
	Language: "Idioma",
	Ruler: "Régua",
	"Rain in": "Chuva em",
	Clear: "Limpar",
	Timeline: "Linha do tempo",
	"No model field on the map.": "Nenhum campo do modelo no mapa.",
	"Sea-level pressure with isobars every 2 hPa. Lows (purple/blue) bring unsettled weather; highs (orange/red) bring calm weather.":
		"Pressão ao nível do mar com isóbaras a cada 2 hPa. Baixas (roxo/azul) favorecem instabilidade; altas (laranja/vermelho), tempo estável.",
	"Storm fuel. Warm colours mean the air has a lot of energy for thunderstorms.":
		"Energia para tempestades. Cores quentes indicam mais energia disponível na atmosfera.",
	"How much the wind changes between the ground and 6 km. Warm colours support organised, long-lived storms.":
		"Variação do vento entre o solo e 6 km. Cores quentes favorecem tempestades organizadas e duradouras.",
	"Rotation available to storms in the lowest 3 km. Warm colours support rotating storms.":
		"Rotação disponível nos primeiros 3 km. Cores quentes favorecem tempestades com rotação.",
	"Temperature at the top of the cloud, from the satellite infrared band. Colder tops mean the storm reaches higher into the atmosphere and is usually stronger. Below about -60°C is a strong storm.":
		"Temperatura do topo da nuvem medida no infravermelho. Topos mais frios geralmente indicam nuvens mais altas e tempestades mais intensas. Abaixo de cerca de -60°C indica forte desenvolvimento.",
	"Height of the cloud top above sea level. Thunderstorms in this region reach 12-17 km.":
		"Altura do topo acima do nível do mar. Nesta região, tempestades podem atingir de 12 a 17 km.",
	"Lightning flashes detected by the GOES lightning mapper in the last 10 minutes, in and around this cell. More lightning means a more intense updraft.":
		"Raios detectados pelo GOES nos últimos 10 minutos nesta célula e arredores. Aumento de raios pode indicar corrente ascendente mais intensa.",
	"Ground area covered by the cold cloud tops of this cell.":
		"Área coberta pelos topos frios desta célula.",
	"Air pressure at sea level from the GFS model. Storms and fronts usually sit in low-pressure areas; high pressure means calmer weather.":
		"Pressão ao nível do mar pelo modelo GFS. Baixa pressão costuma acompanhar tempestades e frentes; alta pressão costuma favorecer tempo estável.",
	"Convective Available Potential Energy: how much fuel the atmosphere has for thunderstorms. Under 500 J/kg is weak, 1000-2500 is strong, above 2500 is extreme.":
		"Energia potencial disponível para convecção. Abaixo de 500 J/kg é baixa; de 1000 a 2500 é alta; acima de 2500 é muito alta.",
	"Convective Inhibition: a lid that stops storms from forming. Values near 0 mean storms can start easily; below -100 they are held back until something breaks the lid.":
		"Inibição convectiva: barreira à formação de tempestades. Perto de zero, a convecção começa mais facilmente; abaixo de -100, exige um mecanismo para vencer a barreira.",
	"Lifted Index: how unstable the air is. Negative values favour storms; below -4 is very unstable.":
		"Índice de levantamento: instabilidade do ar. Valores negativos favorecem tempestades; abaixo de -4 indicam forte instabilidade.",
	"Wind shear between the ground and 6 km: how much the wind changes with height. Above 15-20 m/s storms become organised and long-lived, and supercells become possible.":
		"Variação do vento entre o solo e 6 km. Acima de 15 a 20 m/s favorece tempestades organizadas e duradouras, incluindo supercélulas.",
	"Wind shear between the ground and 1 km. Strong low-level shear is one of the key ingredients for tornadoes.":
		"Variação do vento entre o solo e 1 km. Cisalhamento intenso em baixos níveis é um dos ingredientes associados a tornados.",
	"Storm-Relative Helicity 0-1 km: how much the low-level wind rotates relative to the storm's motion. This is the main tornado ingredient. In the Southern Hemisphere it is negative in favourable environments; magnitudes above 100-150 m²/s² are significant.":
		"Helicidade relativa à tempestade de 0 a 1 km: rotação do vento em relação ao movimento da célula. No Hemisfério Sul, valores negativos podem ser favoráveis; magnitudes acima de 100 a 150 m²/s² são relevantes.",
	"Storm-Relative Helicity 0-3 km: rotation available to the storm in the lowest 3 km. Magnitudes above 250 m²/s² support rotating storms (supercells).":
		"Helicidade relativa de 0 a 3 km. Magnitudes acima de 250 m²/s² favorecem tempestades com rotação.",
	"Lifting Condensation Level: the height of the cloud base. Low cloud bases (under 1000 m) make tornadoes more likely because the rotation is closer to the ground.":
		"Nível de condensação por levantamento: estimativa da base da nuvem. Bases abaixo de 1000 m podem favorecer tornados quando os outros ingredientes estão presentes.",
	"Significant Tornado Parameter: combines CAPE, wind shear, helicity and cloud-base height into one number. Above 1 means the environment can support a significant tornado; 0.3-1 is marginal.":
		"Parâmetro de tornado significativo: combina CAPE, cisalhamento, helicidade e altura da base. Acima de 1 indica ambiente favorável; de 0,3 a 1, marginal.",
	"Environmental favourability for tornadoes based on STP. This is not an observed tornado. Doppler radar can identify rotation, but cannot alone confirm a tornado on the ground.":
		"Favorabilidade do ambiente para tornados, baseada no STP. Não indica tornado observado. Radar Doppler pode identificar rotação, mas não confirma sozinho um tornado no solo.",
	"A sudden increase in the lightning rate. It often happens 10-20 minutes before severe weather (hail, damaging wind) reaches the ground.":
		"Aumento súbito na taxa de raios. Pode preceder granizo ou vento forte em cerca de 10 a 20 minutos.",
	"A spot on the cloud top that is much colder than the surrounding anvil: the updraft is so strong it punches above the top of the storm. A sign of a violent updraft.":
		"Região do topo mais fria que a bigorna ao redor. Pode indicar uma corrente ascendente intensa penetrando acima do topo da tempestade.",
	"Rainfall rate estimated by the satellite from cloud-top temperatures. Good for where and roughly how hard it is raining; radar is more accurate.":
		"Chuva estimada por satélite. Indica localização e intensidade aproximadas; radar costuma ser mais preciso.",
	"Estimated rainfall rate at the target location right now.":
		"Intensidade estimada da chuva no alvo agora.",
};
export function translate(
	language: Language,
	text: string,
	values: Record<string, string | number> = {},
) {
	return (language === "pt" ? (PT[text] ?? text) : text).replace(
		/\{(\w+)\}/g,
		(_, key) => String(values[key] ?? `{${key}}`),
	);
}
const LanguageContext = createContext({
	language: "pt" as Language,
	setLanguage: (_language: Language) => {},
});
export function LanguageProvider({ children }: { children: React.ReactNode }) {
	const [language, setLanguage] = useState<Language>("pt");
	useEffect(() => {
		try {
			if (localStorage.getItem("storm-tracker:language") === "en")
				setLanguage("en");
		} catch {}
	}, []);
	useEffect(() => {
		document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
	}, [language]);
	const change = (value: Language) => {
		setLanguage(value);
		try {
			localStorage.setItem("storm-tracker:language", value);
		} catch {}
	};
	return (
		<LanguageContext.Provider value={{ language, setLanguage: change }}>
			{children}
		</LanguageContext.Provider>
	);
}
export function useTranslation() {
	const context = useContext(LanguageContext);
	return {
		...context,
		t: (text: string, values?: Record<string, string | number>) =>
			translate(context.language, text, values),
	};
}
