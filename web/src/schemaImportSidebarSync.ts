/**
 * Computes workspace sidebar width needed to contain a user-resized schema import textarea.
 */
export function sidebarWidthFromTextareaBoxes(sidebarLeft: number, textareaRight: number, gutterPx = 12): number {
  return Math.ceil(textareaRight - sidebarLeft + gutterPx);
}

export function sidebarWidthForSchemaImportTextarea(textarea: HTMLTextAreaElement): number | null {
  const sidebar = textarea.closest('.workspace-sidebar');
  if (!(sidebar instanceof HTMLElement)) return null;

  const sidebarBox = sidebar.getBoundingClientRect();
  const textareaBox = textarea.getBoundingClientRect();
  return sidebarWidthFromTextareaBoxes(sidebarBox.left, textareaBox.right);
}
