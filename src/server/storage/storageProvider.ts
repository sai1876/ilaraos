import { FileStorageProvider } from './types';
import { GoogleDriveStorageProvider } from './providers/google-drive/provider';

// Add other providers here if scaling to S3/R2
const providers = new Map<string, FileStorageProvider>();

export function getStorageProvider(providerName: string, config: any): FileStorageProvider {
  if (providerName === 'google_drive') {
    if (!providers.has('google_drive')) {
      providers.set('google_drive', new GoogleDriveStorageProvider(config));
    }
    return providers.get('google_drive')!;
  }
  
  throw new Error(`Storage provider ${providerName} is not implemented.`);
}
