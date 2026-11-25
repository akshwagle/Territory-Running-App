export const METRES_PER_MILE=1609.344;
export function distanceLabel(metres,units='km'){return `${(Math.max(0,metres||0)/(units==='mi'?METRES_PER_MILE:1000)).toFixed(2)} ${units==='mi'?'mi':'km'}`;}
export function timeLabel(seconds){const value=Math.max(0,Math.floor(seconds||0));return value>=3600?`${Math.floor(value/3600)}:${String(Math.floor(value/60)%60).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`:`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
export function paceLabel(metres,seconds,units='km'){if(!(metres>0&&seconds>0))return '—';return `${timeLabel(Math.round(seconds*(units==='mi'?METRES_PER_MILE:1000)/metres))} /${units==='mi'?'mi':'km'}`;}
// Decode each server segment separately. A missing sample, pause or long gap
// never produces a connecting SVG line. Bound work on an untrusted response.
export function routePaths(encodedSegments=[]){
  let remaining=20000;
  const segments=[];
  for(const encoded of encodedSegments.slice(0,1000)){
    if(typeof encoded!=='string'||encoded.length>400000)continue;
    const points=[];let index=0,lat=0,lng=0;
    function next(){let result=0,shift=0,b;do{if(index>=encoded.length||shift>30)throw Error('Invalid route');b=encoded.charCodeAt(index++)-63;if(b<0||b>63)throw Error('Invalid route');result+=(b&31)*2**shift;shift+=5;}while(b>=32);return result&1?-(Math.floor(result/2)+1):Math.floor(result/2);}
    try{while(index<encoded.length&&remaining>0){lat+=next();lng+=next();if(Math.abs(lat)>9000000||Math.abs(lng)>18000000)throw Error('Invalid route');points.push([lng/1e5,lat/1e5]);remaining--;}}catch{continue;}
    if(points.length)segments.push(points);
    if(!remaining)break;
  }
  const all=segments.flat();if(!all.length)return [];
  const lat0=all[0][1]*Math.PI/180,project=([lng,lat])=>[lng*Math.cos(lat0),-lat];
  const projected=segments.map(segment=>segment.map(project)),flat=projected.flat();
  const xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top,scale=260/Math.max(width,height,.00001);
  return projected.map(points=>points.map(([x,y],i)=>`${i?'L':'M'}${(20+(260-width*scale)/2+(x-left)*scale).toFixed(2)},${(20+(260-height*scale)/2+(y-top)*scale).toFixed(2)}`).join(' '));
}
