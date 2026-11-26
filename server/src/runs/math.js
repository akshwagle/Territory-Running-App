'use strict';
const EARTH_M=6371008.8;
const radians=n=>n*Math.PI/180;
function haversine(a,b){const lat=radians(b.lat-a.lat),lng=radians(b.lng-a.lng);const h=Math.sin(lat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(lng/2)**2;return 2*EARTH_M*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
function sequenceGaps(sequences){let next=0;const gaps=[];for(const seq of sequences){if(seq>next)gaps.push({from:next,to:seq-1});next=seq+1;}return gaps;}
function encodePolyline(points){let result='',lat=0,lng=0;function encode(delta){let n=delta<0?~(delta<<1):delta<<1;let text='';while(n>=32){text+=String.fromCharCode((32|(n&31))+63);n>>>=5;}return text+String.fromCharCode(n+63);}for(const p of points){const a=Math.round(p.lat*1e5),b=Math.round(p.lng*1e5);result+=encode(a-lat)+encode(b-lng);lat=a;lng=b;}return result;}
// Raw samples are never overwritten. Distance acceptance/trace simplification
// happens only here on the server, within segments and bounded time gaps.
function summarize(points,signals,startedAt,endedAt){
  const metadata=signals.pointMeta||{},segments=signals.segments||[];
  const trace=[],gaps=[],outliers=[];let anchor=null,previous=null,distance=0,accepted=0;
  for(const p of points){
    const m=metadata[p.seq]||{},stamp=+new Date(p.recordedAt),segment=m.segmentId||segments.find(s=>stamp>=+new Date(s.startedAt)&&(!s.endedAt||stamp<=+new Date(s.endedAt)))?.id||'legacy';
    const breakPath=previous&&(segment!==previous.segment||stamp-previous.stamp>30000||p.seq!==previous.seq+1);
    if(previous&&stamp-previous.stamp>2000)gaps.push({fromSeq:previous.seq,toSeq:p.seq,durationMs:stamp-previous.stamp,interpolate:!breakPath});
    if(breakPath){anchor=null;trace.push(null);}
    previous={seq:p.seq,stamp,segment};
    if(p.accuracyM>50||(stamp-+new Date(startedAt)<15000&&p.accuracyM>25))continue;
    if(anchor&&stamp-anchor.stamp>30000){gaps.push({fromSeq:anchor.seq,toSeq:p.seq,durationMs:stamp-anchor.stamp,interpolate:false,reason:'ACCURACY_GAP'});anchor=null;trace.push(null);}
    if(!anchor){anchor={...p,stamp,segment};trace.push(p);accepted++;continue;}
    const delta=haversine(anchor,p),seconds=(stamp-anchor.stamp)/1000;
    if(seconds<=0)continue;
    if(delta>100&&delta/seconds>8.5){outliers.push(p.seq);continue;}
    if(delta<Math.max(8,p.accuracyM,anchor.accuracyM))continue;
    distance+=delta;anchor={...p,stamp,segment};trace.push(p);accepted++;
  }
  const durationMs=segments.length?segments.reduce((sum,s)=>sum+Math.max(0,+new Date(s.endedAt||endedAt)-+new Date(s.startedAt)),0):+endedAt-+startedAt;
  // Each trace segment is decimated independently; gaps/pauses never get joined.
  const raw=[[]];for(const p of trace){if(p)raw.at(-1).push(p);else if(raw.at(-1).length)raw.push([]);}
  const routeSegments=raw.filter(s=>s.length).map(s=>{const stride=Math.max(1,Math.ceil(s.length/512));return s.filter((_,i)=>i%stride===0||i===s.length-1);});
  return {distanceM:Math.round(distance),durationS:Math.max(1,Math.round(durationMs/1000)),acceptedPoints:accepted,gaps,outlierSeqs:outliers,
    routeSegments:routeSegments.map(s=>encodePolyline(s)),polyline:JSON.stringify({version:1,segments:routeSegments.map(s=>encodePolyline(s))})};
}
module.exports={haversine,sequenceGaps,encodePolyline,summarize};
