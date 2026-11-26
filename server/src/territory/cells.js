'use strict';
const h3=require('h3-js');
const {haversine}=require('../runs/math');
const RESOLUTION=11;
const MAX_CELLS_PER_RUN=20000;
const MAX_FILL_STEPS=60;
const MAX_LINK_GAP_MS=30000;
// Converts recorded points into the ordered set of res-11 cells the route crossed.
// Cells between two consecutive trusted fixes are filled with the H3 grid path.
// Chains break at pauses/segments, sequence or time gaps, rejected fixes and
// outliers, so no cell is invented across a gap.
function trustedPoint(p,{minAccuracyM,outliers}){
  return p.provider!=='network'&&p.isMock!==true&&p.accuracyM<=minAccuracyM&&!outliers.has(p.seq);
}
function routeCells(points,{minAccuracyM=30,outlierSeqs=[],pointMeta={}}={}){
  const outliers=new Set(outlierSeqs),seen=new Set(),order=[];
  let previous=null;
  const add=cell=>{if(!seen.has(cell)&&seen.size<MAX_CELLS_PER_RUN){seen.add(cell);order.push(cell);}};
  for(const p of points){
    if(!trustedPoint(p,{minAccuracyM,outliers})){previous=null;continue;}
    const cell=h3.latLngToCell(p.lat,p.lng,RESOLUTION),stamp=+new Date(p.recordedAt),segment=pointMeta[p.seq]?.segmentId||null;
    const linked=previous&&previous.segment===segment&&p.seq===previous.seq+1&&stamp-previous.stamp<=MAX_LINK_GAP_MS&&haversine(previous,p)<=300;
    if(linked&&previous.cell!==cell){
      let path=[cell];
      try{const steps=h3.gridDistance(previous.cell,cell);if(steps<=MAX_FILL_STEPS)path=h3.gridPathCells(previous.cell,cell).slice(1);}catch{/* pentagon/far pair: keep endpoints only */}
      for(const step of path)add(step);
    }else add(cell);
    previous={seq:p.seq,lat:p.lat,lng:p.lng,stamp,segment,cell};
  }
  return order;
}
const toIndex=cell=>BigInt('0x'+cell);
const toCell=index=>BigInt(index).toString(16);
module.exports={routeCells,toIndex,toCell,RESOLUTION,MAX_CELLS_PER_RUN};
