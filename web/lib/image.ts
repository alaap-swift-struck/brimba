// Downsize a chosen photo in the browser before upload, so a 12MB phone
// picture becomes a small square-ish JPEG data URL the worker accepts.

export async function fileToDataUrl(
  file: File,
  maxSize = 512
): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not available")
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", 0.85)
}
