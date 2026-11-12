import { useEffect, useState } from 'react';

export default function useScrolled() {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return scrolled;
}
