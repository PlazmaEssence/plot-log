import { checkpoint } from '../../state/history';
import {
  addYAxis,
  removeYAxis,
  setCalibrationValue,
  updateXAxis,
  updateYAxis,
  xAxis,
  yAxes,
} from '../../state/project';
import type { AxisCal } from '../../state/project';
import { calibrationArm } from '../../state/ui';

interface AxisFieldsProps {
  axis: AxisCal;
  onChange: (patch: Partial<AxisCal>) => void;
}

/**
 * Name/unit edits aren't checkpointed for undo — doing so on every keystroke
 * would make undo step character-by-character. Scale changes and calibration
 * values are, since getting those wrong is expensive to notice and fix.
 */
function AxisFields({ axis, onChange }: AxisFieldsProps) {
  const arm = calibrationArm.value;

  function pick(which: 'p1' | 'p2') {
    calibrationArm.value = { axisId: axis.id, point: which };
  }

  function pickLabel(which: 'p1' | 'p2') {
    if (arm?.axisId === axis.id && arm.point === which) return 'Click chart…';
    return axis[which] ? 'Re-pick' : 'Pick';
  }

  return (
    <div class="field-grid" style="margin-bottom:0.75rem">
      <div class="field">
        <label>Name</label>
        <input value={axis.name} onInput={(e) => onChange({ name: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="field">
        <label>Unit</label>
        <input value={axis.unit} onInput={(e) => onChange({ unit: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="field">
        <label>Scale</label>
        <select
          value={axis.scale}
          onChange={(e) => {
            checkpoint();
            onChange({ scale: (e.target as HTMLSelectElement).value as AxisCal['scale'] });
          }}
        >
          <option value="linear">Linear</option>
          <option value="log">Log</option>
        </select>
      </div>
      {(['p1', 'p2'] as const).map((which) => (
        <div class="field" key={which}>
          <label>{which === 'p1' ? 'Point 1 value' : 'Point 2 value'}</label>
          <div style="display:flex; gap:0.4rem">
            <input
              type="number"
              style="flex:1; min-width:0"
              value={axis[which]?.value ?? ''}
              onInput={(e) => {
                checkpoint();
                setCalibrationValue(axis.id, which, Number((e.target as HTMLInputElement).value));
              }}
            />
            <button
              class="btn btn-ghost btn-sm"
              style="white-space:nowrap"
              title="Click here, then click the corresponding point on the chart"
              onClick={() => pick(which)}
            >
              {pickLabel(which)}
            </button>
          </div>
          {!axis[which] && <div class="hint">Not set yet.</div>}
        </div>
      ))}
    </div>
  );
}

export function AxesPanel() {
  return (
    <div class="section">
      <div class="section-head">
        <span class="section-title">X axis</span>
      </div>
      <AxisFields axis={xAxis.value} onChange={(p) => updateXAxis(p)} />

      <div class="section-head">
        <span class="section-title">Y axes</span>
        <span class="section-meta">{yAxes.value.length}</span>
      </div>
      {yAxes.value.map((axis) => (
        <div key={axis.id} class="input-panel" style="margin-bottom:0.75rem">
          <div class="panel-header">
            <label>{axis.name || 'Y axis'}</label>
            {yAxes.value.length > 1 && (
              <button class="btn btn-ghost btn-sm" onClick={() => removeYAxis(axis.id)}>
                Remove
              </button>
            )}
          </div>
          <AxisFields axis={axis} onChange={(p) => updateYAxis(axis.id, p)} />
        </div>
      ))}
      <button class="btn btn-ghost btn-sm" onClick={() => addYAxis()}>
        + Add Y axis
      </button>
      <p class="hint" style="margin-top:0.75rem">
        Pump charts often stack Head, Power and Efficiency on separate Y axes sharing one Flow
        axis — add one Y axis per curve family and assign each series to the right one in the
        Series tab.
      </p>
    </div>
  );
}
