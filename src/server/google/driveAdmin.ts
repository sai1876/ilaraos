import 'server-only';
import { google } from 'googleapis';

// Environment variables used by GoogleAuth automatically:
// GOOGLE_APPLICATION_CREDENTIALS path
// OR GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY
// OR running on GCP (Compute Engine, Cloud Run, etc.)

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.file']
});

export const drive = google.drive({ version: 'v3', auth });

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

if (!ROOT_FOLDER_ID) {
  // We don't throw immediately so we don't break the build or normal paths if Drive isn't configured,
  // but we will throw during active Drive operations.
  console.warn('GOOGLE_DRIVE_ROOT_FOLDER_ID is missing.');
}

/**
 * Ensures a folder exists and returns its ID.
 */
async function ensureFolder(name: string, parentId: string): Promise<string> {
  const q = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    spaces: 'drive'
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create it
  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
    supportsAllDrives: true
  });

  return created.data.id!;
}

export async function getOrCreateCategoryFolder(date: Date, category: string): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error('Google Drive integration not fully configured (missing root folder).');

  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');

  // We could cache these folder IDs server-side to prevent multiple calls, 
  // but for reliability in Phase 2 we just resolve them.
  const yearFolderId = await ensureFolder(yyyy, ROOT_FOLDER_ID);
  const monthFolderId = await ensureFolder(mm, yearFolderId);
  const dayFolderId = await ensureFolder(dd, monthFolderId);
  
  // Create mapping for Category to actual Folder Name if necessary, or use exactly.
  // We'll capitalize the category for cleaner aesthetics, e.g. "REFUND" -> "Refunds"
  let folderName = category;
  if (category === 'REFUND') folderName = 'Refunds';
  else if (category === 'COMPLAINT') folderName = 'Complaints';
  else if (category === 'WASTAGE') folderName = 'Wastage';
  else if (category === 'INVENTORY') folderName = 'Inventory';
  else if (category === 'PURCHASE') folderName = 'Purchases';
  else if (category === 'CLOSING') folderName = 'Closing';
  else if (category === 'STAFF') folderName = 'Staff';
  else if (category === 'ORDER') folderName = 'Orders';
  else if (category === 'WHATSAPP') folderName = 'WhatsApp';
  else folderName = 'Other';

  const categoryFolderId = await ensureFolder(folderName, dayFolderId);
  return categoryFolderId;
}

export async function getPreGeneratedFileId(): Promise<string> {
  const res = await drive.files.generateIds({
    count: 1,
    space: 'drive',
  });
  if (!res.data.ids || res.data.ids.length === 0) {
    throw new Error('Failed to generate Drive file ID.');
  }
  return res.data.ids[0];
}

export async function createResumableUploadSession(
  folderId: string, 
  fileName: string, 
  mimeType: string, 
  expectedFileId: string,
  declaredSizeBytes?: number
): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error('Failed to obtain Google Drive access token.');
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token.token}`,
    'Content-Type': 'application/json',
    'X-Upload-Content-Type': mimeType,
  };

  if (declaredSizeBytes) {
    headers['X-Upload-Content-Length'] = declaredSizeBytes.toString();
  }

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: expectedFileId,
      name: fileName,
      parents: [folderId]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create resumable session: ${res.status} ${errText}`);
  }

  const sessionUri = res.headers.get('Location');
  if (!sessionUri) {
    throw new Error('No Location header returned for resumable session.');
  }

  return sessionUri;
}

export async function verifyDriveObject(fileId: string) {
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, size, mimeType, parents, driveId, trashed, md5Checksum, sha1Checksum, sha256Checksum',
    supportsAllDrives: true,
  });
  return res.data;
}

export async function streamToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  expectedFileId: string,
  nodeStream: NodeJS.ReadableStream
) {
  const res = await drive.files.create({
    requestBody: {
      id: expectedFileId,
      name: fileName,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: nodeStream
    },
    fields: 'id',
    supportsAllDrives: true
  });
  
  return res.data;
}
