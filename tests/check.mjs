import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server = await createServer({configFile:false, optimizeDeps:{noDiscovery:true}, cacheDir:"node_modules/.vite-tests", resolve:{alias:{'#':fileURLToPath(new URL('../src',import.meta.url))}},server:{middlewareMode:true}});
try {
 const {matrixMotion,assignTracks,summarizeTracks}=await server.ssrLoadModule('/src/server/goes/storms.ts');
 const {translate}=await server.ssrLoadModule('/src/lib/i18n.tsx');
 const {GLOSSARY,OVERLAY_DESCRIPTIONS}=await server.ssrLoadModule('/src/lib/glossary.ts');
 const {fieldImage,contourLines}=await server.ssrLoadModule('/src/lib/field-image.ts');
 const {distanceKm}=await server.ssrLoadModule('/src/lib/geo.ts');
 const {parseSimepar,mergeForecasts}=await server.ssrLoadModule('/src/server/forecast.ts');
 const grid={west:-54,south:-25,step:0.05,cols:60,rows:60};
 function frame(shift,time,cooling=0) {
  const brightnessTemp=new Float32Array(3600);
  for(let r=0;r<60;r++) for(let c=0;c<60;c++) {
   const x=c-shift-25,y=r-25;
   brightnessTemp[r*60+c]=265-55*Math.exp(-(x*x/28+y*y/14))-12*Math.exp(-((x-5)**2+(y+3)**2)/6)+cooling;
  }
  return {time,brightnessTemp};
 }
 const cells=[];for(let r=21;r<=29;r++)for(let c=23;c<=31;c++)cells.push(r*60+c);
 const motion=matrixMotion(grid,frame(2,1200000,-4),frame(0,0),cells);
 assert(motion && motion.vx>28 && motion.vx<32 && motion.vy===0,'recover eastward matrix shift despite cooling');
 assert.equal(matrixMotion(grid,frame(0,0),frame(0,0),cells),undefined,'reject duplicate times');
 assert.equal(matrixMotion(grid,{time:1200000,brightnessTemp:new Float32Array(3600).fill(220)},frame(0,0),cells),undefined,'reject textureless fields');
 assert.equal(matrixMotion(grid,{time:1200000,brightnessTemp:new Float32Array(3600).fill(NaN)},frame(0,0),cells),undefined,'reject missing data');
 const base={trackId:1,lon:-53,lat:-24,areaKm2:100,minBrightnessTempK:210,maxHeightM:12000,flashCount:5,severity:'moderate',overshootDepthK:0,maxRainRateMmh:0,hull:[]};
 const histories=Array.from({length:6},(_,i)=>[{cells,snapshot:{...base,lon:-53+i*.02,lat:-24+(i===5?.15:0)},motion:{vx:i===5?-90:30,vy:i===5?70:0,quality:.9}}]);
 const times=histories.map((_,i)=>i*600000);
 const target={lat:-24,lon:-52};
 const summary=summarizeTracks(times,histories,target)[0];
 assert.equal(summary.headingDeg,90,'reject a single bad vector and centroid jump');
 assert.equal(summary.speedKmh,30);
 assert(summary.forecast.length>0);
 delete histories[5][0].motion;
 assert(summarizeTracks(times,histories,target)[0].forecast.length>0,'hold through one bad scan');
 delete histories[4][0].motion;
 const uncertain=summarizeTracks(times,histories,target)[0];
 assert.equal(uncertain.status,'uncertain');assert.equal(uncertain.etaMinutes,null);assert.equal(uncertain.forecast.length,0);
 const contrary=summarizeTracks([0,600000],[[{cells,snapshot:base,motion:{vx:40,vy:0,quality:1}}],[{cells,snapshot:base,motion:{vx:-40,vy:0,quality:1}}]],target)[0];
 assert.equal(contrary.status,'uncertain','inconsistent vectors must not produce arrival claims');
 const a={cells:[1220,1221,1280,1281],snapshot:{...base,trackId:38}};
 const b={cells:[1221,1222,1281,1282],snapshot:{...base,trackId:0,lon:-52.95},motion:{vx:30,vy:0,quality:1}};
 assert.equal(assignTracks([[a],[b]],grid,[0,600000],39),39);
 assert.equal(b.snapshot.trackId,38,'preserve identity through displacement');
 const refreshed={...b,snapshot:{...b.snapshot}};
 const next={...b,snapshot:{...b.snapshot,trackId:0}};
 assignTracks([[refreshed],[next]],grid,[600000,1200000],39);
 assert.equal(next.snapshot.trackId,38,'seed identity across rolling refresh');
 for(const text of [...Object.values(GLOSSARY),...Object.values(OVERLAY_DESCRIPTIONS)]) {
  assert.notEqual(translate('pt',text),text,`missing translation: ${text}`);
  assert.equal(translate('en',text),text);
  assert(!/[—–]/.test(text));
 }
 assert.equal(translate('pt','{count} motion estimates',{count:4}),'4 estimativas de movimento');
 let pixels;
 globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;}}),toDataURL:()=>''})};
 const g={west:-1,south:-1,step:0.25,cols:9,rows:9};
 const values=Array.from({length:81},(_,i)=>1000+(i%9)*2);
 fieldImage(g,values,{rgba:()=>[255,0,0,1]},{lat:0,lon:0},80);
 assert.equal(pixels[3],0,'clip rectangular corners');
 assert.equal(pixels[(24*48+24)*4+3],255,'keep center');
 const contours=contourLines(g,values,2,{lat:0,lon:0},80);
 assert(contours.features.length>0);
 for(const f of contours.features) for(const [lon,lat] of f.geometry.coordinates) assert(distanceKm({lat:0,lon:0},{lat,lon})<=80);
 const html='<h2><a href="x">\n Umuarama/PR <i></i></a></h2><div class = "table-hourly tab-pane"><span class="did-data">Qua, 30 de Set de 2026</span><div class="ah-header"><div class="ah-time">10:00</div><div class="ah-temp"><i class="wi" title=" Pancadas de chuva "></i>  25˚C </div><div class="ah-prec">0.2 mm</div><div class="ah-wind">N 11 km/h </div></div><span class="var">Probabilidade de Ocorrência de Chuva:</span> <span class="val">\n 40%</span><div class="ah-header"><div class="ah-time">11:00</div><div class="ah-temp"><i class="wi" title="Sol"></i> 27˚C </div><div class="ah-wind">NE 5 km/h</div></div></div>';
 const simepar=parseSimepar(html);
 assert.equal(simepar.city,'Umuarama/PR');
 assert.deepEqual(simepar.hours[0],{time:'2026-09-30T10:00',condition:'Pancadas de chuva',rainMm:0.2,rainChance:40});
 assert.equal(simepar.hours[1].rainMm,0,'missing precipitation means dry');
 const merged=mergeForecasts(simepar.hours,[{time:'2026-09-30T09:00',rainMm:0,rainChance:5},{time:'2026-09-30T10:00',rainMm:1.5,rainChance:80},{time:'2026-09-30T12:00',rainMm:0,rainChance:10}],'2026-09-30T10:00','2026-09-30T12:00');
 assert.deepEqual(merged.map(h=>h.time),['2026-09-30T10:00','2026-09-30T11:00','2026-09-30T12:00'],'merge both sources by local hour inside the window');
 assert.deepEqual(merged[0].ecmwf,{rainMm:1.5,rainChance:80});assert.equal(merged[0].simepar.rainChance,40);
 assert.equal(merged[1].ecmwf,null);assert.equal(merged[2].simepar,null);
 console.log('Passed: Simepar parsing, forecast merge, matrix motion, cooling, outliers, missing scans, rolling IDs, translations and circular overlays.');
} finally {await server.close();}
