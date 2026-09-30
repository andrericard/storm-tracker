export interface GeosProjection {
	satelliteHeight: number;
	equatorialRadius: number;
	polarRadius: number;
	longitudeOrigin: number;
}

export function latLonToScan(proj: GeosProjection, lat: number, lon: number) {
	const req = proj.equatorialRadius;
	const rpol = proj.polarRadius;
	const phi = (lat * Math.PI) / 180;
	const lambda = ((lon - proj.longitudeOrigin) * Math.PI) / 180;
	const e2 = (req * req - rpol * rpol) / (req * req);
	const phiC = Math.atan(((rpol * rpol) / (req * req)) * Math.tan(phi));
	const rc = rpol / Math.sqrt(1 - e2 * Math.cos(phiC) ** 2);
	const sx = proj.satelliteHeight - rc * Math.cos(phiC) * Math.cos(lambda);
	const sy = -rc * Math.cos(phiC) * Math.sin(lambda);
	const sz = rc * Math.sin(phiC);
	return {
		x: Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz)),
		y: Math.atan(sz / sx),
	};
}

export function scanToLatLon(proj: GeosProjection, x: number, y: number) {
	const req = proj.equatorialRadius;
	const rpol = proj.polarRadius;
	const h = proj.satelliteHeight;
	const cosX = Math.cos(x);
	const sinX = Math.sin(x);
	const cosY = Math.cos(y);
	const sinY = Math.sin(y);
	const ratio = (req * req) / (rpol * rpol);
	const a = sinX * sinX + cosX * cosX * (cosY * cosY + ratio * sinY * sinY);
	const b = -2 * h * cosX * cosY;
	const c = h * h - req * req;
	const disc = b * b - 4 * a * c;
	if (disc < 0) return null;
	const rs = (-b - Math.sqrt(disc)) / (2 * a);
	const sx = rs * cosX * cosY;
	const sy = -rs * sinX;
	const sz = rs * cosX * sinY;
	return {
		lat:
			(Math.atan((ratio * sz) / Math.sqrt((h - sx) ** 2 + sy * sy)) * 180) /
			Math.PI,
		lon: proj.longitudeOrigin - (Math.atan(sy / (h - sx)) * 180) / Math.PI,
	};
}
