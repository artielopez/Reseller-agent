// Reproducible local icons from our original vector; Sharp is supplied by Next.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const size of [180, 192, 512]) {
  await sharp(fileURLToPath(new URL("../public/favicon.svg", import.meta.url)))
    .resize(size, size)
    .png()
    .toFile(
      fileURLToPath(
        new URL(`../public/icons/icon-${size}.png`, import.meta.url),
      ),
    );
}
