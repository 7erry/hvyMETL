import { useEffect } from 'react';
import { useCopilotOptional } from '../copilot/CopilotContext';

/** Global Cmd/Ctrl+K toggles the agent copilot drawer. */
export function useCopilotHotkeys(): void {
  const copilot = useCopilotOptional();

  useEffect(() => {
    if (!copilot) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        copilot.toggleOpen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copilot]);
}
