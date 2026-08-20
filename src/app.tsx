import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasStage } from './ui/CanvasStage';
import type { Stage } from './ui/Stage';
import { AxesPanel } from './ui/panels/AxesPanel';
import { ExportPanel } from './ui/panels/ExportPanel';
import { ImportPanel } from './ui/panels/ImportPanel';
import { SeriesPanel } from './ui/panels/SeriesPanel';
import { canRedo, canUndo, redo, undo } from './state/history';
import { image } from './state/project';

type Tab = 'import' | 'axes' | 'series' | 'export';
const TABS: Tab[] = ['import', 'axes', 'series', 'export'];

export function App() {
  const stageRef = useRef<Stage | null>(null);
  const [tab, setTab] = useState<Tab>('import');
  const img = image.value;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === 'z') {
        e.preventDefault();
        undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Fit the view the moment a (new) image lands, and jump to axis calibration —
  // that's always the next thing to do after loading a chart.
  useEffect(() => {
    if (!img) return;
    stageRef.current?.fitToView();
    setTab((t) => (t === 'import' ? 'axes' : t));
  }, [img]);

  return (
    <>
      <header class="site-header">
        <a class="logo-link" href="/">
          <span class="logo-mark">📈</span>
          <span class="logo-text">Plot Log</span>
        </a>
        <span class="sub">Pump curve digitizer</span>
      </header>

      <main class="wide">
        <div class="intro">
          <h1>Digitize a pump curve</h1>
          <p>
            Drop in a chart image, calibrate the axes, and trace the curves. Everything runs in
            your browser — nothing is uploaded, nothing is stored anywhere but here.
          </p>
        </div>

        <div class="workspace">
          <div class="stage-wrap">
            <div class="stage-toolbar">
              <div class="pill-row">
                <button class="btn btn-ghost btn-sm" disabled={!canUndo.value} onClick={undo}>
                  Undo
                </button>
                <button class="btn btn-ghost btn-sm" disabled={!canRedo.value} onClick={redo}>
                  Redo
                </button>
              </div>
              <button
                class="btn btn-ghost btn-sm"
                disabled={!img}
                onClick={() => stageRef.current?.fitToView()}
              >
                Fit to view
              </button>
            </div>
            <CanvasStage onReady={(s) => (stageRef.current = s)} />
          </div>

          <aside class="side-panel">
            <div class="pill-row" style="margin-bottom:1rem">
              {TABS.map((t) => (
                <button
                  key={t}
                  class={`pill pill-gold${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {tab === 'import' && <ImportPanel />}
            {tab === 'axes' && <AxesPanel />}
            {tab === 'series' && <SeriesPanel />}
            {tab === 'export' && <ExportPanel />}
          </aside>
        </div>
      </main>

      <footer class="site-footer">
        <a href="https://github.com/PlazmaEssence/plot-log" target="_blank" rel="noreferrer">
          Plot Log on GitHub
        </a>
      </footer>
    </>
  );
}
