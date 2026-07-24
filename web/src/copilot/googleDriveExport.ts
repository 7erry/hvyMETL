type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export type GoogleDriveUploadResult = {
  fileId: string;
  webViewLink?: string;
};

let googleIdentityScriptPromise: Promise<void> | null = null;

/** Loads Google Identity Services for OAuth token requests. */
export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hvymetl-google-identity="true"]');
    if (existing) {
      waitForGoogleIdentity(resolve, reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.hvymetlGoogleIdentity = 'true';
    script.onload = () => waitForGoogleIdentity(resolve, reject);
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

function waitForGoogleIdentity(resolve: () => void, reject: (error: Error) => void): void {
  const started = Date.now();
  const poll = (): void => {
    if (window.google?.accounts?.oauth2?.initTokenClient) {
      resolve();
      return;
    }
    if (Date.now() - started > 10_000) {
      reject(new Error('Google Identity Services did not initialize.'));
      return;
    }
    window.setTimeout(poll, 50);
  };
  poll();
}

/** Requests a short-lived Google OAuth access token with Drive file scope. */
export function requestGoogleDriveAccessToken(clientId: string, prompt: '' | 'consent' = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const init = window.google?.accounts?.oauth2?.initTokenClient;
    if (!init) {
      reject(new Error('Google Identity Services is not available.'));
      return;
    }

    const tokenClient = init({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

/** Creates a native Google Doc from HTML architecture review content. */
export async function uploadArchitectureReviewToGoogleDocs(input: {
  clientId: string;
  title: string;
  html: string;
}): Promise<GoogleDriveUploadResult> {
  let accessToken: string;
  try {
    accessToken = await requestGoogleDriveAccessToken(input.clientId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/interaction_required|consent|login/i.test(message)) {
      accessToken = await requestGoogleDriveAccessToken(input.clientId, 'consent');
    } else {
      throw error;
    }
  }

  const metadata = {
    name: input.title,
    mimeType: 'application/vnd.google-apps.document',
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([input.html], { type: 'text/html' }));

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  const payload = (await response.json()) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Google Drive upload failed (${response.status}).`);
  }
  if (!payload.id) {
    throw new Error('Google Drive upload succeeded but no file id was returned.');
  }
  return { fileId: payload.id, webViewLink: payload.webViewLink };
}

/** Opens a newly created Google Doc in a new browser tab when possible. */
export function openGoogleDoc(result: GoogleDriveUploadResult): void {
  const url =
    result.webViewLink ??
    (result.fileId ? `https://docs.google.com/document/d/${result.fileId}/edit` : undefined);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
