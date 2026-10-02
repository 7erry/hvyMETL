import { serializeCollectionPlanJson } from './components/CollectionJsonView';
import type { CollectionPlan } from './migrationPlanTypes';

/** JSON Crack widget origin and embed URL. */
export const JSON_CRACK_ORIGIN = 'https://jsoncrack.com';
export const JSON_CRACK_WIDGET_URL = `${JSON_CRACK_ORIGIN}/widget`;
export const JSON_CRACK_IFRAME_ID = 'json-crack-embed';

export type JsonCrackPostOptions = {
  theme: 'light' | 'dark';
  direction: 'TOP' | 'RIGHT' | 'DOWN' | 'LEFT';
};

/** Payload JSON Crack expects via postMessage after the widget signals ready. */
export function buildJsonCrackPostMessage(
  json: string,
  options: JsonCrackPostOptions = { theme: 'dark', direction: 'RIGHT' },
): { json: string; options: JsonCrackPostOptions } {
  return { json, options };
}

/** True when the embed iframe posted its id (ready for data). */
export function isJsonCrackReadyMessage(event: MessageEvent, iframeId: string): boolean {
  return event.origin === JSON_CRACK_ORIGIN && event.data === iframeId;
}

export function collectionPlanJsonForJsonCrack(collection: CollectionPlan): string {
  return serializeCollectionPlanJson(collection);
}
