import { ImportError } from './import';
import { buildZip, readZip, ZipError } from './zip';
import { clearHistory } from '../state/history';
import { resetUi } from '../state/ui';
import {
  activeSeriesId,
  series,
  setImage,
  xAxis,
  yAxes,
  type AxisCal,
  type ProjectImageData,
  type Series,
} from '../state/project';

/**
 * A full session as a .plotlog.zip: the source image plus every bit of state
 * needed to keep calibrating and tracing where you left off — axis
 * calibration, series, and their raw pixel points. Closing the tab (or
 * handing the file to someone else) doesn't lose any of that, unlike the
 * plain CSV/JSON exports in io/export.ts, which only carry resolved values
 * for a finished project and can't be reopened here.
 *
 * Points and calibration stay in image-pixel space in this file too (see
 * state/project.ts) — reloading a session and nudging an axis still
 * recomputes every value instead of baking in whatever was true at save time.
 */

const SESSION_VERSION = 1;
const PROJECT_ENTRY = 'project.json';

interface SessionProjectFile {
  version: number;
  image: { name: string; mime: string; width: number; height: number };
  xAxis: AxisCal;
  yAxes: AxisCal[];
  series: Series[];
  activeSeriesId: string | null;
}

function extensionFor(mime: string): string {
  const ext = mime.split('/')[1];
  return ext && /^[a-z0-9]+$/i.test(ext) ? ext : 'bin';
}

/** Builds the session archive for the current project. Null if there's no image to save yet. */
export async function buildSessionZip(img: ProjectImageData): Promise<Blob> {
  const imageBytes = new Uint8Array(await img.blob.arrayBuffer());
  const mime = img.blob.type || 'application/octet-stream';
  const imageEntryName = `image.${extensionFor(mime)}`;

  const project: SessionProjectFile = {
    version: SESSION_VERSION,
    image: { name: img.name, mime, width: img.width, height: img.height },
    xAxis: xAxis.value,
    yAxes: yAxes.value,
    series: series.value,
    activeSeriesId: activeSeriesId.value,
  };

  const archive = buildZip([
    { name: PROJECT_ENTRY, data: new TextEncoder().encode(JSON.stringify(project, null, 2)) },
    { name: imageEntryName, data: imageBytes },
  ]);
  return new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' });
}

/** Exported for testing — the createImageBitmap half of loadSessionZip isn't available under Node. */
export function readProjectFile(entries: Map<string, Uint8Array>): SessionProjectFile {
  const raw = entries.get(PROJECT_ENTRY);
  if (!raw) throw new ImportError('That .zip doesn\'t look like a Plot Log session (no project.json inside).');

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ImportError('That session file is corrupt — its project.json isn\'t valid JSON.');
  }

  const p = parsed as Partial<SessionProjectFile> | null;
  if (
    !p ||
    typeof p !== 'object' ||
    typeof p.version !== 'number' ||
    !p.image ||
    !p.xAxis ||
    !Array.isArray(p.yAxes) ||
    !Array.isArray(p.series)
  ) {
    throw new ImportError('That session file is missing data Plot Log needs to reopen it.');
  }
  if (p.version > SESSION_VERSION) {
    throw new ImportError('That session was saved by a newer version of Plot Log — please update the app.');
  }
  return p as SessionProjectFile;
}

/** Reads a .plotlog.zip and replaces the current project with it. Throws {@link ImportError} on a bad file. */
export async function loadSessionZip(file: File | Blob): Promise<void> {
  let entries: Map<string, Uint8Array>;
  try {
    entries = readZip(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof ZipError) throw new ImportError(e.message);
    throw e;
  }

  const project = readProjectFile(entries);
  const imageBytes = entries.get(`image.${extensionFor(project.image.mime)}`);
  if (!imageBytes) {
    throw new ImportError('That session file is missing its image.');
  }

  const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: project.image.mime });
  const bitmap = await createImageBitmap(blob);

  setImage({ bitmap, width: project.image.width, height: project.image.height, name: project.image.name, blob });
  xAxis.value = project.xAxis;
  yAxes.value = project.yAxes;
  series.value = project.series;
  activeSeriesId.value = project.activeSeriesId;
  clearHistory();
  resetUi();
}
