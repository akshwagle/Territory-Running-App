import usePresentationMotion from '../hooks/usePresentationMotion.js';
import * as m from 'motion/react-m';

export default function Reveal({ children, className = '' }) {
  const animate = usePresentationMotion();
  if (!animate) return <div className={className}>{children}</div>;
  return <m.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.45 }}>{children}</m.div>;
}
