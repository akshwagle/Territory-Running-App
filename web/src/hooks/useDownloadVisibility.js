import { useEffect, useState } from 'react';

export function getDevice() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(ua) ? 'android' : 'desktop';
}

export default function useDownloadVisibility(heroRef, installRef, enabled) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled || !window.IntersectionObserver) return;
    let frame = null;
    const update = () => {
      const hero = heroRef.current.getBoundingClientRect();
      const install = installRef.current.getBoundingClientRect();
      setShow(hero.bottom <= 76 && install.top > window.innerHeight);
    };
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(() => { frame = null; update(); });
    };
    const observer = new IntersectionObserver(update, { rootMargin: '-76px 0px 0px 0px', threshold: 0 });
    observer.observe(heroRef.current);
    observer.observe(installRef.current);
    // Anchor jumps can skip an entire section without changing its intersection state.
    // Re-read geometry once per rendered scroll frame, including jumps back from the footer.
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [heroRef, installRef, enabled]);
  return enabled && show;
}
