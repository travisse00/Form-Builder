
export async function uploadImage(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const folder = process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary configuration is missing.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  if (folder) {
    formData.append("folder", folder);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Image upload failed.");
  }

  return data.secure_url;
}
