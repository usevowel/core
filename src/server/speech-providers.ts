/**
 * Speech provider registry derived from stack environment variables.
 */

export type SpeechModality = "stt" | "tts";

export interface SpeechProviderSelection {
  provider?: string;
  model?: string;
  language?: string;
  voice?: string;
}

export interface SpeechProviderStatus {
  configured: boolean;
  label: string;
  supports: SpeechModality[];
  defaults: {
    sttModel?: string;
    sttLanguage?: string;
    ttsModel?: string;
    ttsVoice?: string;
  };
  env: string[];
}

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function getOpenAICompatibleBaseUrl(): string | undefined {
  return readEnv("OPENAI_COMPATIBLE_BASE_URL") ?? readEnv("ECHOLINE_BASE_URL");
}

function getOpenAICompatibleApiKey(): string | undefined {
  return readEnv("OPENAI_COMPATIBLE_API_KEY") ?? readEnv("ECHOLINE_API_KEY");
}

export function getSpeechProviderRegistry(): Record<string, SpeechProviderStatus> {
  return {
    deepgram: {
      configured: Boolean(readEnv("DEEPGRAM_API_KEY")),
      label: "Deepgram",
      supports: ["stt", "tts"],
      defaults: {
        sttModel: readEnv("DEEPGRAM_STT_MODEL") ?? "nova-3",
        sttLanguage: readEnv("DEEPGRAM_STT_LANGUAGE") ?? "en-US",
        ttsModel: readEnv("DEEPGRAM_TTS_MODEL") ?? "aura-2-thalia-en",
      },
      env: ["DEEPGRAM_API_KEY", "DEEPGRAM_STT_MODEL", "DEEPGRAM_STT_LANGUAGE", "DEEPGRAM_TTS_MODEL"],
    },
    "openai-compatible": {
      configured: Boolean(getOpenAICompatibleBaseUrl()),
      label: "OpenAI-Compatible Audio",
      supports: ["stt", "tts"],
      defaults: {
        sttModel: readEnv("ECHOLINE_STT_MODEL") ?? "Systran/faster-whisper-tiny",
        sttLanguage: readEnv("ECHOLINE_STT_LANGUAGE"),
        ttsModel: readEnv("ECHOLINE_TTS_MODEL") ?? "onnx-community/Kokoro-82M-v1.0-ONNX",
        ttsVoice: readEnv("ECHOLINE_TTS_VOICE") ?? readEnv("DEFAULT_VOICE") ?? "af_heart",
      },
      env: [
        "OPENAI_COMPATIBLE_BASE_URL",
        "OPENAI_COMPATIBLE_API_KEY",
        "ECHOLINE_BASE_URL",
        "ECHOLINE_API_KEY",
        "ECHOLINE_STT_MODEL",
        "ECHOLINE_TTS_MODEL",
        "ECHOLINE_TTS_VOICE",
      ],
    },
  };
}

export function getDefaultSpeechProviderSelection(modality: SpeechModality): SpeechProviderSelection | undefined {
  const registry = getSpeechProviderRegistry();
  const provider =
    readEnv(modality === "stt" ? "DEFAULT_STT_PROVIDER" : "DEFAULT_TTS_PROVIDER") ??
    readEnv(modality === "stt" ? "STT_PROVIDER" : "TTS_PROVIDER");

  if (!provider) {
    return undefined;
  }

  const entry = registry[provider];
  if (!entry || !entry.configured || !entry.supports.includes(modality)) {
    return undefined;
  }

  return modality === "stt"
    ? {
        provider,
        model: entry.defaults.sttModel,
        language: entry.defaults.sttLanguage,
      }
    : {
        provider,
        model: entry.defaults.ttsModel,
        voice: entry.defaults.ttsVoice,
      };
}

export function validateSpeechProviderSelection(
  modality: SpeechModality,
  selection: SpeechProviderSelection | undefined
): void {
  const provider = selection?.provider?.trim();
  if (!provider) {
    return;
  }

  const registry = getSpeechProviderRegistry();
  const entry = registry[provider];
  if (!entry) {
    throw new Error(`Unsupported ${modality.toUpperCase()} provider: ${provider}`);
  }

  if (!entry.supports.includes(modality)) {
    throw new Error(`${entry.label} does not support ${modality.toUpperCase()}`);
  }

  if (!entry.configured) {
    throw new Error(`${entry.label} is not configured in this stack`);
  }
}

export function buildSpeechProviderConfig(
  modality: SpeechModality,
  selection: SpeechProviderSelection | undefined
): { provider: string; config: Record<string, unknown> } | undefined {
  const explicitProvider = selection?.provider?.trim();
  const resolved = explicitProvider ? selection : getDefaultSpeechProviderSelection(modality);
  const provider = resolved?.provider?.trim();

  if (!provider) {
    return undefined;
  }

  validateSpeechProviderSelection(modality, resolved);

  if (modality === "stt") {
    if (provider === "deepgram") {
      return {
        provider,
        config: {
          apiKey: readEnv("DEEPGRAM_API_KEY") ?? "",
          model: resolved?.model?.trim() || readEnv("DEEPGRAM_STT_MODEL") || "nova-3",
          language: resolved?.language?.trim() || readEnv("DEEPGRAM_STT_LANGUAGE") || "en-US",
          sampleRate: Number.parseInt(readEnv("DEEPGRAM_STT_SAMPLE_RATE") ?? "16000", 10),
        },
      };
    }

    if (provider === "openai-compatible") {
      return {
        provider,
        config: {
          apiKey: getOpenAICompatibleApiKey() ?? "",
          baseUrl: getOpenAICompatibleBaseUrl() ?? "",
          model: resolved?.model?.trim() || readEnv("ECHOLINE_STT_MODEL") || "Systran/faster-whisper-tiny",
          language: resolved?.language?.trim() || readEnv("ECHOLINE_STT_LANGUAGE"),
          sampleRate: Number.parseInt(readEnv("ECHOLINE_STT_SAMPLE_RATE") ?? "24000", 10),
        },
      };
    }
  }

  if (provider === "deepgram") {
    return {
      provider,
      config: {
        apiKey: readEnv("DEEPGRAM_API_KEY") ?? "",
        model:
          resolved?.model?.trim() ||
          resolved?.voice?.trim() ||
          readEnv("DEEPGRAM_TTS_MODEL") ||
          "aura-2-thalia-en",
        sampleRate: Number.parseInt(readEnv("DEEPGRAM_TTS_SAMPLE_RATE") ?? "24000", 10),
        encoding: readEnv("DEEPGRAM_TTS_ENCODING") || "linear16",
      },
    };
  }

  if (provider === "openai-compatible") {
    return {
      provider,
      config: {
        apiKey: getOpenAICompatibleApiKey() ?? "",
        baseUrl: getOpenAICompatibleBaseUrl() ?? "",
        model: resolved?.model?.trim() || readEnv("ECHOLINE_TTS_MODEL") || "onnx-community/Kokoro-82M-v1.0-ONNX",
        voice:
          resolved?.voice?.trim() ||
          readEnv("ECHOLINE_TTS_VOICE") ||
          readEnv("DEFAULT_VOICE") ||
          "af_heart",
        sampleRate: Number.parseInt(readEnv("ECHOLINE_TTS_SAMPLE_RATE") ?? "24000", 10),
        responseFormat: readEnv("ECHOLINE_TTS_RESPONSE_FORMAT") || "wav",
      },
    };
  }

  return undefined;
}
