import { checkpoint } from '../../state/history';
import { activeSeriesId, addSeries, removeSeries, series, updateSeries, yAxes } from '../../state/project';
import { activeTool } from '../../state/ui';

export function SeriesPanel() {
  const list = series.value;
  const active = activeSeriesId.value;

  return (
    <div class="section">
      <div class="section-head">
        <span class="section-title">Series</span>
        <span class="section-meta">{list.length}</span>
      </div>

      <div class="pill-row" style="margin-bottom:0.75rem">
        <button
          class={`pill pill-gold${activeTool.value === 'view' ? ' active' : ''}`}
          onClick={() => (activeTool.value = 'view')}
        >
          Select / move
        </button>
        <button
          class={`pill pill-gold${activeTool.value === 'add-point' ? ' active' : ''}`}
          onClick={() => (activeTool.value = 'add-point')}
          disabled={!active}
          title={active ? undefined : 'Add a series first'}
        >
          Add point
        </button>
      </div>

      {list.map((s) => (
        <div
          key={s.id}
          class="input-panel"
          style={`margin-bottom:0.5rem; cursor:pointer; ${s.id === active ? 'border-color:var(--gold-border)' : ''}`}
          onClick={() => (activeSeriesId.value = s.id)}
        >
          <div class="panel-header">
            <div style="display:flex; align-items:center; gap:0.5rem; flex:1">
              <input
                type="color"
                value={s.color}
                onClick={(e) => e.stopPropagation()}
                onInput={(e) => updateSeries(s.id, { color: (e.target as HTMLInputElement).value })}
                style="width:22px;height:22px;padding:0;border:none;background:none;cursor:pointer;flex:none"
              />
              <input
                value={s.label}
                onClick={(e) => e.stopPropagation()}
                onInput={(e) => updateSeries(s.id, { label: (e.target as HTMLInputElement).value })}
                style="background:transparent;border:none;color:inherit;font-size:0.9rem;width:100%"
              />
            </div>
            <span class="section-meta">{s.points.length} pts</span>
          </div>
          <div class="field-grid" onClick={(e) => e.stopPropagation()}>
            <div class="field">
              <label>Y axis</label>
              <select
                value={s.yAxisId}
                onChange={(e) => updateSeries(s.id, { yAxisId: (e.target as HTMLSelectElement).value })}
              >
                {yAxes.value.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name || 'Y axis'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div class="pill-row" style="margin-top:0.5rem" onClick={(e) => e.stopPropagation()}>
            <button class="btn btn-ghost btn-sm" onClick={() => updateSeries(s.id, { visible: !s.visible })}>
              {s.visible ? 'Hide' : 'Show'}
            </button>
            <button class="btn btn-ghost btn-sm" onClick={() => updateSeries(s.id, { locked: !s.locked })}>
              {s.locked ? 'Unlock' : 'Lock'}
            </button>
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => {
                checkpoint();
                removeSeries(s.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <button
        class="btn btn-gold btn-sm"
        onClick={() => {
          checkpoint();
          addSeries();
        }}
      >
        + Add series
      </button>

      {list.length > 0 && (
        <p class="hint" style="margin-top:0.75rem">
          Pick "Add point" above, then click the chart to place points on the active (highlighted)
          series. Drag any point to move it, click to select it, Delete to remove it.
        </p>
      )}
    </div>
  );
}
