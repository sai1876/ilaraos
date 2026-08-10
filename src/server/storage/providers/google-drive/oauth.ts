import { google } from 'googleapis';
import { encryptStorageToken } from '../../../crypto/storageEncryption';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export function getGoogleOAuthUrl(outletId: string, returnPath: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );

  // The state parameter can carry the outletId and a return path
  const state = Buffer.from(JSON.stringify({ outletId, returnPath })).toString('base64');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Essential to get the refresh token
    prompt: 'consent', // Force consent screen to ensure we get a refresh token
    scope: SCOPES,
    state,
  });
}

export async function handleGoogleOAuthCallback(code: string, state: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.refresh_token) {
    throw new Error('No refresh token received from Google. User may need to revoke and re-consent.');
  }

  const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  const { outletId, returnPath } = decodedState;

  // Verify identity from token
  oauth2Client.setCredentials(tokens);
  const drive2 = google.drive({ version: 'v3', auth: oauth2Client });
  const about = await drive2.about.get({ fields: 'user' });
  const accountEmail = about.data.user?.emailAddress;

  // Encrypt the refresh token
  const aadContext = `google_drive:${outletId}`;
  const encryptedPayload = encryptStorageToken(tokens.refresh_token, aadContext);

  return {
    outletId,
    returnPath,
    accountEmail,
    encryptedRefreshToken: JSON.stringify(encryptedPayload),
    scope: tokens.scope || SCOPES.join(' '),
  };
}
