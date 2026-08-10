export interface StoredFileResult {
  providerFileId: string;
  providerFolderId?: string;
  sizeBytes: number;
  mimeType: string;
  checksumSha256: string;
}

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
}

export interface FolderResult {
  folderId: string;
  name: string;
  parentFolderId?: string;
}

export interface StorageHealth {
  status: 'connected' | 'disconnected' | 'degraded' | 'error';
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId?: string;
  expectedSha256?: string;
}

export interface FileStorageProvider {
  /** Uploads a file stream or buffer to the external provider */
  uploadFile(input: UploadInput): Promise<StoredFileResult>;
  
  /** Gets file metadata directly from provider */
  getMetadata(fileId: string): Promise<FileMetadata>;
  
  /** Streams file contents back to application for preview */
  getFileStream(fileId: string): Promise<NodeJS.ReadableStream>;
  
  /** Deletes the file from the provider */
  deleteFile(fileId: string): Promise<void>;
  
  /** Creates or retrieves a folder hierarchy */
  createFolder(name: string, parentFolderId?: string): Promise<FolderResult>;
  
  /** Verifies API connectivity and credentials */
  verifyConnection(): Promise<StorageHealth>;
}
