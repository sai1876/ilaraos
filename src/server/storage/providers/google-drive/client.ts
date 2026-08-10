import { google } from 'googleapis';
import { decryptStorageToken } from '../../../crypto/storageEncryption';

export function createGoogleDriveClient(config: any) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );

  if (config.encrypted_refresh_token) {
    try {
      const envelope = JSON.parse(config.encrypted_refresh_token);
      const refreshToken = decryptStorageToken(envelope, `google_drive:${config.outlet_id}`);
      
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
    } catch (e) {
      console.error('Failed to decrypt storage token for outlet:', config.outlet_id);
    }
  }

  return google.drive({ version: 'v3', auth: oauth2Client });
}
