import { setImage } from '../state/project';
import type { ProjectImageData } from '../state/project';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export class ImportError extends Error {}

export async function loadImageFile(file: File): Promise<ProjectImageData> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    if (file.type === 'application/pdf') {
      throw new ImportError(
        'PDF import is coming soon. For now, export the chart page as a PNG or take a screenshot of it.',
      );
    }
    throw new ImportError(
      `Unsupported file type${file.type ? `: ${file.type}` : ''}. Use a PNG, JPEG or WebP image.`,
    );
  }
  const bitmap = await createImageBitmap(file);
  return { bitmap, width: bitmap.width, height: bitmap.height, name: file.name };
}

/** Loads the file and installs it as the project's image. Throws {@link ImportError} on a bad file. */
export async function importFile(file: File): Promise<void> {
  const img = await loadImageFile(file);
  setImage(img);
}

/** Pulls the first file out of a drop event's DataTransferItemList or an <input type=file>'s FileList. */
export function extractFile(source: DataTransferItemList | FileList | null): File | null {
  if (!source) return null;
  if (source instanceof FileList) {
    return source.length ? source[0] : null;
  }
  for (const item of Array.from(source)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
