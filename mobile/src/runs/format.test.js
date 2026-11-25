import {it,expect} from 'vitest';
import {distanceLabel,timeLabel,paceLabel,routePaths,claimTiles,verdictText,flagText,statusLabel} from './format.js';
it('LIFE-02 unit conversion, long time and pace keep stable labels without fabricated zero pace',()=>{
 expect(distanceLabel(1609.344,'mi')).toBe('1.00 mi');expect(distanceLabel(1000)).toBe('1.00 km');expect(timeLabel(3661)).toBe('1:01:01');expect(paceLabel(1000,300)).toBe('5:00 /km');expect(paceLabel(1609.344,600,'mi')).toBe('10:00 /mi');expect(paceLabel(0,100)).toBe('—');
});
it('GPS-04 SVG paths never connect separate encoded segments and reject malformed input',()=>{
 const paths=routePaths(['_p~iF~ps|U_ulLnnqC_mqNvxq`@','_p~iF~ps|U_ulLnnqC']);expect(paths).toHaveLength(2);expect(paths.every(p=>p.startsWith('M'))).toBe(true);expect(routePaths(['broken','~~~'])).toEqual([]);expect(routePaths()).toEqual([]);
});
it('STEP06 territory copy: tiles, verdicts, flag reasons and status labels',()=>{
 const claim={claimed:12,capturedFromOthers:5,lost:2,heldNow:10,onCooldown:0,restricted:0};
 expect(claimTiles(claim).map(t=>[t.key,t.value])).toEqual([['claimed',12],['captured',5],['lost',2],['held',10]]);
 expect(verdictText({status:'VALID',claim})).toBe('You claimed 12 hexes');expect(verdictText({status:'VALID',claim:{...claim,claimed:1}})).toBe('You claimed 1 hex');
 expect(verdictText({status:'VALID',claim:{claimed:0}})).toBe('No new territory this time');expect(verdictText({status:'FLAGGED'})).toBe('Held for review');expect(verdictText({status:'REJECTED'})).toBe('Too short to claim');
 expect(flagText({status:'FLAGGED',reasons:[],flags:[{reason:'MOCK_LOCATION'},{reason:'SPEED_LIMIT'}]})).toBe('No territory was claimed. Mock location was detected. The pace was faster than a run.');
 expect(flagText({status:'REJECTED',reasons:['TOO_SHORT'],flags:[]})).toMatch(/100 m/);expect(flagText({status:'VALID',reasons:[],flags:[]})).toBe('');
 expect(statusLabel('VALID')).toBe('Validated');expect(statusLabel('PENDING_VALIDATION')).toBe('Pending validation');
});
