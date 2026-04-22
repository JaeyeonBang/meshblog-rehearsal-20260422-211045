import OpenAI from "openai"

/**
 * Lazily validates OPENAI_API_KEY at call time (not at module import).
 * This allows tests to import `chunkText`, `embeddingToBlob`, `blobToEmbedding`
 * without an API key — those functions don't call OpenAI.
 */
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      "Problem: OPENAI_API_KEY is not set.\n" +
      "Cause:   generateEmbedding() requires the OpenAI API.\n" +
      "Fix:     Add OPENAI_API_KEY=sk-... to .env.local (get from platform.openai.com/api-keys).",
    )
  }
  return new OpenAI({ apiKey })
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)

  if (!cleaned) {
    throw new Error("Empty text cannot be embedded")
  }

  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: cleaned,
  })

  return response.data[0].embedding
}

export function chunkText(text: string, maxChunkSize = 1500): string[] {
  const cleaned = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()

  if (cleaned.length <= maxChunkSize) {
    return [cleaned]
  }

  const sentences = cleaned.split(/[.!?。]\s+/)
  const chunks: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChunkSize && current) {
      chunks.push(current.trim())
      current = ""
    }
    current += sentence + ". "
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.length > 0 ? chunks : [cleaned.slice(0, maxChunkSize)]
}

/**
 * Serialize a number[] embedding to a SQLite BLOB-compatible Buffer (Float32Array bytes).
 * 1536-dim → 6144 bytes.
 */
export function embeddingToBlob(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding)
  return Buffer.from(float32.buffer)
}

/**
 * Deserialize a BLOB Buffer (from SQLite) back to a number[] embedding.
 */
export function blobToEmbedding(buf: Buffer): number[] {
  const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return Array.from(float32)
}
