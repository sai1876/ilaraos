
import {
  downloadMetaMedia,
  sendWhatsAppMessage,
  type WhatsAppSendResult,
} from '@/server/whatsapp/client';

// Keep the historical imports stable while routing every Meta request through
// the canonical server-side WhatsApp client.
export { downloadMetaMedia, sendWhatsAppMessage };
export type { WhatsAppSendResult };


