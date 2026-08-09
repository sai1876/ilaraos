import { describe, expect, it, vi, beforeEach } from 'vitest';
import { transcribeAudioWithGemini } from '@/server/whatsapp/chat/voiceTranscriber';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn(),
  };
});

describe('WhatsApp Voice Transcriber', () => {
  let generateContentMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'fixture-key');

    generateContentMock = vi.fn().mockResolvedValue({
      text: 'One classic burger',
    });

    (GoogleGenAI as any).mockImplementation(() => ({
      models: {
        generateContent: generateContentMock,
      },
    }));
  });

  it('transcribes valid audio buffer successfully', async () => {
    const fakeAudio = Buffer.from('fake-audio-data');
    const result = await transcribeAudioWithGemini(fakeAudio, 'audio/ogg; codecs=opus');

    expect(result).toBe('One classic burger');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    
    // Check if the mimeType was normalized
    const callArgs = generateContentMock.mock.calls[0][0];
    expect(callArgs.contents[0].parts[0].inlineData.mimeType).toBe('audio/ogg');
  });

  it('throws error if API key is missing', async () => {
    vi.unstubAllEnvs();
    const fakeAudio = Buffer.from('fake-audio-data');

    await expect(transcribeAudioWithGemini(fakeAudio)).rejects.toThrow('GEMINI_API_KEY is missing');
  });

  it('throws error if buffer is empty', async () => {
    const emptyBuffer = Buffer.from('');

    await expect(transcribeAudioWithGemini(emptyBuffer)).rejects.toThrow('Audio buffer is empty');
  });

  it('throws error if buffer exceeds 10MB limit', async () => {
    // 10MB + 1 byte
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);

    await expect(transcribeAudioWithGemini(largeBuffer)).rejects.toThrow(/exceeds maximum size/);
  });

  it('retries once if transcription fails or times out', async () => {
    const fakeAudio = Buffer.from('fake-audio-data');
    
    // Fail first time, succeed second time
    generateContentMock
      .mockRejectedValueOnce(new Error('Simulated failure'))
      .mockResolvedValueOnce({ text: 'Second try success' });

    const result = await transcribeAudioWithGemini(fakeAudio, 'audio/mp3');

    expect(result).toBe('Second try success');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('throws after retry fails', async () => {
    const fakeAudio = Buffer.from('fake-audio-data');
    
    generateContentMock.mockRejectedValue(new Error('Simulated failure'));

    await expect(transcribeAudioWithGemini(fakeAudio)).rejects.toThrow('Simulated failure');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});
