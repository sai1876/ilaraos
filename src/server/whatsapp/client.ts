import { maskPhone } from '@/lib/security/maskPii';

export const DEFAULT_WHATSAPP_GRAPH_API_VERSION = 'v24.0';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}

export type WhatsAppMetaError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type WhatsAppSendResult =
  | {
      ok: true;
      messageId: string;
      status: number;
    }
  | {
      ok: false;
      status: number;
      code?: number;
      subcode?: number;
      type?: string;
      fbtraceId?: string;
      error: string;
    };

export function getWhatsAppConfig(): WhatsAppConfig {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_BOT_NUMBER_ID?.trim();
  const graphApiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || DEFAULT_WHATSAPP_GRAPH_API_VERSION;

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is missing');
  }
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_BOT_NUMBER_ID is missing');
  }
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error('WHATSAPP_GRAPH_API_VERSION is invalid');
  }

  return { accessToken, phoneNumberId, graphApiVersion };
}

export function getMetaGraphUrl(path: string, graphApiVersion?: string): string {
  const version =
    graphApiVersion?.trim() ||
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ||
    DEFAULT_WHATSAPP_GRAPH_API_VERSION;
  const cleanPath = path.replace(/^\/+/, '');
  return `https://graph.facebook.com/${version}/${cleanPath}`;
}

function normalizeRecipient(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

function parseMetaFailure(status: number, body: any): WhatsAppSendResult {
  const metaError: WhatsAppMetaError | undefined = body?.error;
  const message =
    typeof metaError?.message === 'string'
      ? metaError.message
      : typeof body?.raw === 'string'
        ? body.raw
        : `Meta Graph API request failed with HTTP ${status}`;

  return {
    ok: false,
    status,
    code: typeof metaError?.code === 'number' ? metaError.code : undefined,
    subcode:
      typeof metaError?.error_subcode === 'number' ? metaError.error_subcode : undefined,
    type: typeof metaError?.type === 'string' ? metaError.type : undefined,
    fbtraceId:
      typeof metaError?.fbtrace_id === 'string' ? metaError.fbtrace_id : undefined,
    error: message,
  };
}

function logMetaFailure(result: Extract<WhatsAppSendResult, { ok: false }>, recipient: string) {
  const payload = {
    recipient: maskPhone(recipient),
    status: result.status,
    code: result.code,
    subcode: result.subcode,
    type: result.type,
    fbtrace_id: result.fbtraceId,
    error: result.error,
  };

  console.error('[WA_META_SEND_FAILED]', JSON.stringify(payload));

  if (result.code === 190 || result.status === 401 || result.status === 403) {
    console.error(
      '[WA_AUTH_ERROR] WhatsApp access token or Meta permissions were rejected. Check token validity, permissions, app/WABA access, and Phone Number ID.',
    );
  }
}

/**
 * Canonical WhatsApp Cloud API text sender.
 * The supplied webhook phone_number_id is accepted only when it matches the configured bot ID.
 */
export async function sendWhatsAppMessage(
  incomingPhoneNumberId: string | undefined,
  toPhone: string,
  message: string,
): Promise<WhatsAppSendResult> {
  let config: WhatsAppConfig;
  try {
    config = getWhatsAppConfig();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'WhatsApp configuration error';
    const result: WhatsAppSendResult = { ok: false, status: 0, error: msg };
    console.error('[WA_META_SEND_FAILED]', msg);
    return result;
  }

  const suppliedPhoneNumberId = incomingPhoneNumberId?.trim();
  if (
    suppliedPhoneNumberId &&
    suppliedPhoneNumberId !== 'unknown' &&
    suppliedPhoneNumberId !== config.phoneNumberId
  ) {
    const result: WhatsAppSendResult = {
      ok: false,
      status: 403,
      error: 'Webhook phone_number_id does not match WHATSAPP_BOT_NUMBER_ID',
    };
    logMetaFailure(result, toPhone);
    return result;
  }

  const targetPhoneNumberId =
    suppliedPhoneNumberId && suppliedPhoneNumberId !== 'unknown'
      ? suppliedPhoneNumberId
      : config.phoneNumberId;

  const recipient = normalizeRecipient(toPhone);
  if (!recipient) {
    const result: WhatsAppSendResult = {
      ok: false,
      status: 400,
      error: 'Recipient phone number is empty after normalization',
    };
    logMetaFailure(result, toPhone);
    return result;
  }

  console.log(
    '[WA_META_SEND_START]',
    JSON.stringify({ recipient: maskPhone(recipient), phone_number_id: targetPhoneNumberId }),
  );

  let response: Response;
  try {
    response = await fetch(
      getMetaGraphUrl(`${targetPhoneNumberId}/messages`, config.graphApiVersion),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }),
      },
    );
  } catch (error) {
    const result: WhatsAppSendResult = {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Network request to Meta failed',
    };
    logMetaFailure(result, recipient);
    return result;
  }

  const body = await safeJson(response);
  if (!response.ok) {
    const result = parseMetaFailure(response.status, body);
    logMetaFailure(result as Extract<WhatsAppSendResult, { ok: false }>, recipient);
    return result;
  }

  const messageId = body?.messages?.[0]?.id;
  if (typeof messageId !== 'string' || !messageId) {
    const result: WhatsAppSendResult = {
      ok: false,
      status: response.status,
      error: 'Meta accepted the HTTP request but did not return an outbound WhatsApp message ID',
    };
    logMetaFailure(result, recipient);
    return result;
  }

  console.log(
    '[WA_META_SEND_ACCEPTED]',
    JSON.stringify({ recipient: maskPhone(recipient), message_id: messageId, status: response.status }),
  );

  return { ok: true, messageId, status: response.status };
}

/** Download a WhatsApp media object using the same canonical Meta configuration. */
export async function downloadMetaMedia(mediaId: string): Promise<Buffer> {
  const config = getWhatsAppConfig();

  const metadataResponse = await fetch(
    getMetaGraphUrl(mediaId, config.graphApiVersion),
    { headers: { Authorization: `Bearer ${config.accessToken}` } },
  );
  const metadataBody = await safeJson(metadataResponse);

  if (!metadataResponse.ok) {
    const failure = parseMetaFailure(metadataResponse.status, metadataBody);
    throw new Error(
      `Meta media metadata request failed (${failure.status}): ${
        'error' in failure ? failure.error : 'unknown error'
      }`,
    );
  }

  const downloadUrl = metadataBody?.url;
  if (typeof downloadUrl !== 'string' || !downloadUrl.startsWith('https://')) {
    throw new Error('Meta media metadata response did not contain a valid HTTPS download URL');
  }

  const mediaResponse = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  if (!mediaResponse.ok) {
    throw new Error(`Meta media download failed with HTTP ${mediaResponse.status}`);
  }

  return Buffer.from(await mediaResponse.arrayBuffer());
}
