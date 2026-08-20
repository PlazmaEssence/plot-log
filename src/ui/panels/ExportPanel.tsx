import { useState } from 'preact/hooks';
import {
  buildLongCsv,
  buildProjectJson,
  buildSeriesTsv,
  copyToClipboard,
  downloadText,
  resolveSeriesPoints,
} from '../../io/export';
import { series, xAxis, yAxes } from '../../state/project';

const PREVIEW_LIMIT = 200;

export function ExportPanel() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const list = series.value;
  const x = xAxis.value;
  const allY = yAxes.value;

  const previewSeries = list[0];
  const previewYAxis = previewSeries && allY.find((a) => a.id === previewSeries.yAxisId);
  const previewRows =
    previewSeries && previewYAxis
      ? resolveSeriesPoints(x, previewYAxis, previewSeries).slice(0, PREVIEW_LIMIT)
      : [];

  async function copySeriesTsv(id: string) {
    const s = list.find((s) => s.id === id);
    const yAxis = s && allY.find((a) => a.id === s.yAxisId);
    if (!s || !yAxis) return;
    await copyToClipboard(buildSeriesTsv(x, yAxis, s));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  if (list.length === 0) {
    return (
      <div class="section">
        <div class="section-head">
          <span class="section-title">Export</span>
        </div>
        <p class="section-meta">Add a series and some points to export data.</p>
      </div>
    );
  }

  return (
    <div class="section">
      <div class="section-head">
        <span class="section-title">Export</span>
      </div>

      <div class="pill-row" style="margin-bottom:1rem">
        <button
          class="btn btn-gold btn-sm"
          onClick={() => downloadText(buildLongCsv(x, allY, list), 'plot-log.csv', 'text/csv')}
        >
          Download CSV
        </button>
        <button
          class="btn btn-ghost btn-sm"
          onClick={() =>
            downloadText(buildProjectJson(x, allY, list), 'plot-log.json', 'application/json')
          }
        >
          Download JSON
        </button>
      </div>

      <div class="section-head">
        <span class="section-title" style="font-size:0.9rem">
          Copy one series as TSV (paste into Excel)
        </span>
      </div>
      <div class="pill-row" style="margin-bottom:1rem">
        {list.map((s) => (
          <button key={s.id} class="btn btn-ghost btn-sm" onClick={() => copySeriesTsv(s.id)}>
            {copiedId === s.id ? 'Copied ✓' : s.label}
          </button>
        ))}
      </div>

      {previewSeries && previewYAxis && (
        <>
          <div class="table-wrap">
            <table class="preview">
              <thead>
                <tr>
                  <th>
                    {x.name}
                    {x.unit ? ` (${x.unit})` : ''}
                  </th>
                  <th>
                    {previewSeries.label}
                    {previewYAxis.unit ? ` (${previewYAxis.unit})` : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.x ?? '—'}</td>
                    <td>{r.y ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewSeries.points.length > PREVIEW_LIMIT && (
            <p class="hint">
              Showing first {PREVIEW_LIMIT} of {previewSeries.points.length} points of "
              {previewSeries.label}" — the download includes every series in full.
            </p>
          )}
        </>
      )}
    </div>
  );
}
