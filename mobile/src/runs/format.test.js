import {it,expect} from 'vitest';
import {distanceLabel,timeLabel,paceLabel,routePaths} from './format.js';
it('LIFE-02 unit conversion, long time and pace keep stable labels without fabricated zero pace',()=>{
 expect(distanceLabel(1609.344,'mi')).toBe('1.00 mi');expect(distanceLabel(1000)).toBe('1.00 km');expect(timeLabel(3661)).toBe('1:01:01');expect(paceLabel(1000,300)).toBe('5:00 /km');expect(paceLabel(1609.344,600,'mi')).toBe('10:00 /mi');expect(paceLabel(0,100)).toBe('—');
});
it('GPS-04 SVG paths never connect separate encoded segments and reject malformed input',()=>{
 const paths=routePaths(['_p~iF~ps|U_ulLnnqC_mqNvxq`@','_p~iF~ps|U_ulLnnqC']);expect(paths).toHaveLength(2);expect(paths.every(p=>p.startsWith('M'))).toBe(true);expect(routePaths(['broken','~~~'])).toEqual([]);expect(routePaths()).toEqual([]);
});
