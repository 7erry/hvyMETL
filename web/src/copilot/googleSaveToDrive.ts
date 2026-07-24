type SaveToDriveParams = {
  src: string;
  filename: string;
  sitename?: string;
};

type GoogleSaveToDriveApi = {
  render: (container: HTMLElement | string, params: SaveToDriveParams) => void;
};

declare global {
  interface Window {
    gapi?: {
      savetodrive?: GoogleSaveToDriveApi;
    };
  }
}

let platformScriptPromise: Promise<void> | null = null;

/** Loads Google platform.js once for Save to Drive button rendering. */
export function loadGoogleSaveToDriveScript(): Promise<void> {
  if (window.gapi?.savetodrive?.render) {
    return Promise.resolve();
  }
  if (platformScriptPromise) return platformScriptPromise;

  platformScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hvymetl-gapi="true"]');
    if (existing) {
      waitForSaveToDrive(resolve, reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/platform.js';
    script.async = true;
    script.defer = true;
    script.dataset.hvymetlGapi = 'true';
    script.onload = () => waitForSaveToDrive(resolve, reject);
    script.onerror = () => reject(new Error('Failed to load Google Save to Drive script.'));
    document.head.appendChild(script);
  });

  return platformScriptPromise;
}

function waitForSaveToDrive(resolve: () => void, reject: (error: Error) => void): void {
  const started = Date.now();
  const poll = (): void => {
    if (window.gapi?.savetodrive?.render) {
      resolve();
      return;
    }
    if (Date.now() - started > 10_000) {
      reject(new Error('Google Save to Drive API did not initialize.'));
      return;
    }
    window.setTimeout(poll, 50);
  };
  poll();
}

/** Renders Google's Save to Drive button inside the given container. */
export function renderSaveToDriveButton(
  container: HTMLElement,
  params: SaveToDriveParams,
): void {
  container.replaceChildren();
  if (!window.gapi?.savetodrive?.render) {
    throw new Error('Google Save to Drive API is not loaded.');
  }
  window.gapi.savetodrive.render(container, {
    sitename: 'hvyMETL',
    ...params,
  });
}
