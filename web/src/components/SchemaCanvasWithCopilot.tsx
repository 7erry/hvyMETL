import { SchemaCanvas } from './SchemaCanvas';
import { useCopilot } from '../copilot/CopilotContext';
import type { ComponentProps } from 'react';

type SchemaCanvasWithCopilotProps = Omit<
  ComponentProps<typeof SchemaCanvas>,
  'highlightedTables' | 'guardrailIssues' | 'onGuardrailClick'
>;

/** Schema canvas wired to copilot highlights and guardrail badges. */
export function SchemaCanvasWithCopilot(props: SchemaCanvasWithCopilotProps) {
  const copilot = useCopilot();

  return (
    <SchemaCanvas
      {...props}
      highlightedTables={copilot.highlightedTables}
      guardrailIssues={copilot.guardrailIssues}
      onGuardrailClick={copilot.openGuardrailPrompt}
    />
  );
}
