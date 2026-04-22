export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OpenRouterOptions = {
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
  temperature?: number
}

export async function callOpenRouter(options: OpenRouterOptions): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set in environment")
  }

  const {
    messages,
    model = process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini",
    maxTokens = 2000,
    temperature = 0.7,
  } = options

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/JaeyeonBang/meshblog",
      "X-Title": "meshblog",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${text}`)
  }

  return response
}
