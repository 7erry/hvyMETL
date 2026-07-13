import { useEffect, useState } from 'react';

const MOBILE_MEDIA = '(max-width: 768px)';

/** True when the viewport is narrow enough to use compact diagram layout. */
export function useCompactDiagramLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MEDIA).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA);
    const onChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return compact;
}
