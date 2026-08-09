import { GoogleGenAI } from '@google/genai';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB limit

function normalizeMimeType(mimeType: string): string {
  const mime = mimeType.split(';')[0].trim().toLowerCase();
  
  // Google Gemini API explicitly accepts audio/ogg, audio/mp3, audio/mpeg, audio/wav, audio/aac, audio/flac.
  // For WhatsApp OGG/Opus, we use audio/ogg.
  if (mime === 'audio/ogg' || mime === 'audio/opus') {
    return 'audio/ogg'; // Ensure we map to the exact string Google expects for Ogg Vorbis/Opus
  }
  
  return mime;
}

export async function transcribeAudioWithGemini(
  audioBuffer: Buffer,
  rawMimeType: string = 'audio/ogg; codecs=opus'
): Promise<string> {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new Error(`Audio buffer exceeds maximum size of ${MAX_AUDIO_BYTES} bytes`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const mimeType = normalizeMimeType(rawMimeType);
  const ai = new GoogleGenAI({ apiKey });

  console.log('[WA_VOICE_TRANSCRIPTION_STARTED]', JSON.stringify({ model: 'gemini-3.6-flash' }));
  const startTime = Date.now();

  const prompt = `Transcribe the spoken audio faithfully.
Rules:
- Return only the spoken transcript.
- Do not answer the speaker.
- Do not summarize.
- Do not infer an order that was not spoken.
- Preserve product names, quantities and prices carefully.
- Preserve mixed-language speech and code-switching.
- Preserve English/Hindi/Telugu words as spoken where possible.
- If a word is unclear, do not invent a restaurant item.`;

  const doTranscription = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audioBuffer.toString('base64'),
                mimeType: mimeType
              }
            },
            { text: prompt }
          ]
        }
      ]
    });
    return response.text?.trim() || '';
  };

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Transcription request timed out')), 10000); // 10s timeout
    });

    let transcript = '';
    try {
      transcript = await Promise.race([doTranscription(), timeoutPromise]);
    } catch (error) {
      // Single retry logic
      console.warn('[WA_VOICE_TRANSCRIPTION_RETRY]', error);
      const retryTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transcription request timed out (retry)')), 10000);
      });
      transcript = await Promise.race([doTranscription(), retryTimeoutPromise]);
    }

    console.log('[WA_VOICE_TRANSCRIPTION_SUCCESS]', JSON.stringify({
      chars: transcript.length,
      duration_ms: Date.now() - startTime
    }));

    return transcript;

  } catch (error) {
    console.error('[WA_VOICE_TRANSCRIPTION_FAILED]', JSON.stringify({
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    }));
    throw error;
  }
}
