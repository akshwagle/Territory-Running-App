import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export default function useStickyPresence(show) {
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let frame, timer;
    if (show) {
      setPresent(true);
      if (reduced) setEntered(true);
      else frame = requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      if (reduced) setPresent(false);
      else timer = setTimeout(() => setPresent(false), 200);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [show, reduced]);
  return { present, entered: show && entered };
}
