// Runs in the browser: shrinks phone photos (often 3–5 MB) before upload, which
// keeps uploads fast on mobile data and under the server action size limit.
export async function resizeImage(file: File, maxSize = 800): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // PNG keeps logo transparency; photos go to JPEG for size.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), type, 0.85),
  );
  return new File([blob], type === "image/png" ? "image.png" : "image.jpg", { type });
}
