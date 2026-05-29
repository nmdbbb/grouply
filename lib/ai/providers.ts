// lib/ai/providers.ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'

export const PROVIDERS = {
  anthropic: { label: 'Claude',  placeholder: 'sk-ant-...', model: 'claude-sonnet-4-20250514',  envKey: 'ANTHROPIC_API_KEY' },
  groq:      { label: 'Groq',    placeholder: 'gsk_...',    model: 'llama-3.3-70b-versatile',   envKey: 'GROQ_API_KEY' },
  openai:    { label: 'OpenAI',  placeholder: 'sk-...',     model: 'gpt-4o',                    envKey: 'OPENAI_API_KEY' },
  google:    { label: 'Gemini',  placeholder: 'AIza...',    model: 'gemini-2.0-flash',           envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  xai:       { label: 'xAI',     placeholder: 'xai-...',    model: 'grok-3',                    envKey: 'XAI_API_KEY' },
} as const

export type ProviderId = keyof typeof PROVIDERS

export function getModelInstance(provider: ProviderId, apiKey: string) {
  const model = PROVIDERS[provider].model
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'groq':      return createGroq({ apiKey })(model)
    case 'openai':    return createOpenAI({ apiKey })(model)
    case 'google':    return createGoogleGenerativeAI({ apiKey })(model)
    case 'xai':       return createXai({ apiKey })(model)
  }
}
