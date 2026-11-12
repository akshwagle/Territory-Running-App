import { createElement } from 'react';
import { domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { hexPoints } from './components/Logo.jsx';

export function StepOutline() {
  return createElement(m.polygon, {
    points: hexPoints, fill: 'none', stroke: 'currentColor', strokeWidth: 1,
    pathLength: 1, strokeDasharray: 1, initial: { strokeDashoffset: 1 },
    whileInView: { strokeDashoffset: 0 }, viewport: { once: true },
    transition: { duration: 0.6, ease: 'easeOut' },
  });
}
export default domAnimation;
