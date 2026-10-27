import { photoError, type Photo } from "./domain";
/** Re-encode photos to reduce storage and strip camera metadata before saving. */
export async function preparePhoto(file: File): Promise<Photo> {
  const error = photoError(file);
  if (error) throw new Error(error);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (image.width * image.height > 60_000_000)
      throw new Error("This image is too large. Export a smaller photo.");
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot process this photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.8);
    if (url.length > 2_700_000)
      throw new Error("Photo is still too large. Choose a smaller image.");
    return { id: crypto.randomUUID(), url };
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error(
      "This photo could not be read. Try a different JPEG or PNG.",
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
