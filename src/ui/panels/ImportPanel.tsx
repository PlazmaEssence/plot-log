import { useEffect, useRef, useState } from 'preact/hooks';
import { ImportError, extractFile, importFile } from '../../io/import';
import { clearHistory } from '../../state/history';
import { image, setImage } from '../../state/project';

export function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const img = image.value;

  async function handleFiles(source: FileList | DataTransferItemList | null) {
    const file = extractFile(source);
    if (!file) return;
    setError(null);
    try {
      clearHistory();
      await importFile(file);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Could not read that file.');
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.clipboardData) handleFiles(e.clipboardData.items);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div class="section">
      <div
        class={`dropzone${dragging ? ' drag' : ''}`}
        tabIndex={0}
        role="button"
        aria-label="Add a chart image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer) handleFiles(e.dataTransfer.files);
        }}
      >
        {img ? (
          <>
            <strong>{img.name}</strong>
            <div class="hint">
              {img.width} × {img.height}px — click or drop to replace
            </div>
          </>
        ) : (
          <>
            <strong>Drop a chart image here</strong>
            <div class="hint">or click to browse — or paste a screenshot with ⌘/Ctrl+V</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(e) => {
          const target = e.target as HTMLInputElement;
          handleFiles(target.files);
          target.value = '';
        }}
      />
      {error && (
        <div class="notice notice-danger" style="margin-top:0.75rem">
          {error}
        </div>
      )}
      {img && (
        <button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onClick={() => setImage(null)}>
          Remove image
        </button>
      )}
      <p class="hint" style="margin-top:1rem">
        PDF import is coming soon — for a PDF datasheet, export the page as a PNG or screenshot it
        for now.
      </p>
    </div>
  );
}
