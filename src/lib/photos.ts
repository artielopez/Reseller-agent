import { photoError, type Photo } from "./domain";
import { withRequestDeadline } from "./request-deadline";
/** Re-encode photos to reduce storage and strip camera metadata before saving. */
export async function preparePhoto(
  file: File,
  parent?: AbortSignal,
): Promise<Photo> {
  const error = photoError(file);
  if (error) throw new Error(error);
  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement | undefined;
  try {
    return await withRequestDeadline(
      async (signal) => {
        image = new Image();
        image.src = objectUrl;
        await image.decode();
        signal.throwIfAborted();
        if (image.width * image.height > 60_000_000)
          throw new Error("This image is too large. Export a smaller photo.");
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Your browser cannot process this photo.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL("image/jpeg", 0.8);
        if (url.length > 2_700_000)
          throw new Error("Photo is still too large. Choose a smaller image.");
        return { id: crypto.randomUUID(), url };
      },
      "Photo preparation did not finish. Your existing photos are kept. Try selecting the photo again or export a smaller JPEG.",
      parent,
      30_000,
    );
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error(
      "This photo could not be read. Try a different JPEG or PNG.",
    );
  } finally {
    image?.removeAttribute("src");
    URL.revokeObjectURL(objectUrl);
  }
}
