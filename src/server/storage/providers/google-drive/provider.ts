import { FileStorageProvider, UploadInput, StoredFileResult, FileMetadata, FolderResult, StorageHealth } from '../../types';
import { createGoogleDriveClient } from './client';
import { computeSha256 } from '../../storageService';
import { Readable } from 'stream';

export class GoogleDriveStorageProvider implements FileStorageProvider {
  private drive: ReturnType<typeof createGoogleDriveClient>;

  constructor(private config: any) {
    this.drive = createGoogleDriveClient(config);
  }

  async uploadFile(input: UploadInput): Promise<StoredFileResult> {
    const expectedSha = input.expectedSha256 || computeSha256(input.buffer);
    
    // Convert Buffer to stream for googleapis
    const bufferStream = new Readable();
    bufferStream.push(input.buffer);
    bufferStream.push(null);

    const parents = input.folderId ? [input.folderId] : undefined;

    const response = await this.drive.files.create({
      requestBody: {
        name: input.filename,
        parents,
      },
      media: {
        mimeType: input.mimeType,
        body: bufferStream
      },
      fields: 'id, size, mimeType, md5Checksum'
    });

    const file = response.data;
    if (!file.id) {
      throw new Error('Upload failed: Google Drive did not return a file ID.');
    }

    // Verify size
    if (file.size && parseInt(file.size, 10) !== input.buffer.length) {
      // Size mismatch, we should probably delete it or flag it
      throw new Error(`Integrity error: uploaded size ${file.size} does not match buffer size ${input.buffer.length}`);
    }

    return {
      providerFileId: file.id,
      providerFolderId: input.folderId,
      sizeBytes: parseInt(file.size || '0', 10),
      mimeType: file.mimeType || input.mimeType,
      checksumSha256: expectedSha // We store our computed sha256. Google only returns md5Checksum for some files natively.
    };
  }

  async getMetadata(fileId: string): Promise<FileMetadata> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size'
    });

    const file = response.data;
    return {
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      sizeBytes: parseInt(file.size || '0', 10)
    };
  }

  async getFileStream(fileId: string): Promise<NodeJS.ReadableStream> {
    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return response.data as NodeJS.ReadableStream;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  async createFolder(name: string, parentFolderId?: string): Promise<FolderResult> {
    const parents = parentFolderId ? [parentFolderId] : undefined;
    
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents,
      },
      fields: 'id, name, parents'
    });

    const file = response.data;
    return {
      folderId: file.id!,
      name: file.name!,
      parentFolderId: file.parents?.[0]
    };
  }

  async verifyConnection(): Promise<StorageHealth> {
    try {
      // Just fetch the root 'about' or a generic query to verify auth
      await this.drive.about.get({ fields: 'user' });
      return { status: 'connected' };
    } catch (error: any) {
      return { 
        status: 'error',
        lastErrorCode: error.code || 'UNKNOWN',
        lastErrorMessage: error.message
      };
    }
  }
}
