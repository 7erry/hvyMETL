import type { CopilotChatMessage } from './groveChat.js';
import { isArchitectureReviewRequest } from './copilotArchitecturePrompt.js';

/** True when the conversation includes an Architecture Review user turn (including tool-loop follow-ups). */
export function conversationNeedsArchitectureInstructions(messages: CopilotChatMessage[]): boolean {
  return messages.some((message) => message.role === 'user' && isArchitectureReviewRequest(message.content));
}
