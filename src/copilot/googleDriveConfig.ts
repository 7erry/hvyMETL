/** Reads the Google OAuth client id used for Architecture Review export to Google Docs. */
export function readGoogleDriveClientId(): string | undefined {
  const value = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  return value || undefined;
}
