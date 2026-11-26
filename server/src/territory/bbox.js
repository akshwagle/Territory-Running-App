'use strict';
const h3=require('h3-js');
const PARENT_RES=7,CELL_RES=11;
// All res-11 descendants of one res-7 cell form one contiguous H3 index range:
// the four free digits occupy bits 12-23; digits are 0..6 so the range ends at 0b110 x4.
function childRange(parent){
  const index=BigInt('0x'+parent),resMask=0xFn<<52n,freeBits=((1n<<12n)-1n)<<12n;
  const base=(index&~resMask&~freeBits)|(BigInt(CELL_RES)<<52n);
  return {min:base,max:base|(0b110110110110n<<12n)};
}
function coveringRanges({minLat,minLng,maxLat,maxLng}){
  // Sample the box on a ~1 km lattice (res-7 cells are ~2.5 km wide), then add each
  // sample's neighbours so a cell that only clips the box edge is still covered.
  const seeds=new Set(),step=0.01,latSteps=Math.ceil((maxLat-minLat)/step),lngSteps=Math.ceil((maxLng-minLng)/step);
  for(let i=0;i<=latSteps;i++)for(let j=0;j<=lngSteps;j++)seeds.add(h3.latLngToCell(Math.min(maxLat,minLat+i*step),Math.min(maxLng,minLng+j*step),PARENT_RES));
  const parents=new Set();for(const seed of seeds)for(const n of h3.gridDisk(seed,1))parents.add(n);
  return [...parents].map(childRange);
}
module.exports={childRange,coveringRanges};
