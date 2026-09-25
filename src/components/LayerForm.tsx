import { useState } from "react";
import type { Borehole, Layer } from "../types";
import {
  CATEGORIES,
  SOIL_COLORS,
  SOIL_STATES,
  findGap,
  round2,
  validateLayer,
  type Errors,
  type LayerFormValues,
} from "../domain";

interface Props {
  hole: Borehole;
  editing?: Layer | null;
  onSubmit: (values: LayerFormValues) => void;
  onCancel: () => void;
}

export default function LayerForm({ hole, editing, onSubmit, onCancel }: Props) {
  // 新增时定位到第一个缺口（接续上一层底），删除中间层后也能回填
  const gap = findGap(hole);
  const startTop = editing ? editing.top : gap?.start ?? 0;
  const nextTop = editing
    ? (() => {
        const ordered = [...hole.layers]
          .filter((l) => l.id !== editing.id)
          .sort((a, b) => a.top - b.top);
        return ordered.find((l) => l.top > editing.top)?.top ?? null;
      })()
    : gap?.nextTop ?? null;

  const [values, setValues] = useState<LayerFormValues>(
    editing
      ? {
          top: String(editing.top),
          bottom: String(editing.bottom),
          category: editing.category,
          color: editing.color,
          state: editing.state,
          description: editing.description,
          sptDepth: editing.sptDepth === null ? "" : String(editing.sptDepth),
          sptN: editing.sptN === null ? "" : String(editing.sptN),
        }
      : {
          top: String(round2(startTop)),
          bottom: "",
          category: "",
          color: "",
          state: "",
          description: "",
          sptDepth: "",
          sptN: "",
        }
  );
  const [errors, setErrors] = useState<
    Errors<"top" | "bottom" | "category" | "sptDepth" | "sptN">
  >({});

  const setStr =
    (key: keyof LayerFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = () => {
    const next = validateLayer(hole, values, editing?.id ?? null);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  };

  return (
    <div className="form-card">
      <div className="form-title">
        <h3>
          {editing ? "编辑分层" : "新增分层"}
          <span className="depth-hint">
            {editing
              ? `原层段 ${round2(editing.top)}–${round2(editing.bottom)} m`
              : gap
                ? nextTop !== null
                  ? `从 ${round2(gap.start)} m 接续，止于 ${round2(nextTop)} m 前`
                  : `从 ${round2(gap.start)} m 接续，至孔深 ${round2(hole.depth)} m`
                : ""}
          </span>
        </h3>
        <button className="link-btn" onClick={onCancel}>取消</button>
      </div>
      <div className="field-grid">
        <label className={errors.top ? "field-error" : ""}>
          <span>层顶深度 (m) *</span>
          <input inputMode="decimal" value={values.top} onChange={setStr("top")} />
          {errors.top && <em>{errors.top}</em>}
        </label>
        <label className={errors.bottom ? "field-error" : ""}>
          <span>层底深度 (m) *</span>
          <input inputMode="decimal" value={values.bottom} onChange={setStr("bottom")} />
          {errors.bottom && <em>{errors.bottom}</em>}
        </label>
        <label className={errors.category ? "field-error" : ""}>
          <span>岩性分类 *</span>
          <select value={values.category} onChange={setStr("category")}>
            <option value="">请选择分类</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.category && <em>{errors.category}</em>}
        </label>
        <label>
          <span>土色</span>
          <select value={values.color} onChange={setStr("color")}>
            <option value="">未选择</option>
            {SOIL_COLORS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select value={values.state} onChange={setStr("state")}>
            <option value="">未选择</option>
            {SOIL_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>岩性描述</span>
          <textarea
            rows={2}
            placeholder="含杂质、密实度、芯样情况等"
            value={values.description}
            onChange={setStr("description")}
          />
        </label>
        <label className={errors.sptDepth ? "field-error" : ""}>
          <span>标贯点深度 (m)</span>
          <input inputMode="decimal" value={values.sptDepth} onChange={setStr("sptDepth")} />
          {errors.sptDepth && <em>{errors.sptDepth}</em>}
        </label>
        <label className={errors.sptN ? "field-error" : ""}>
          <span>标贯击数 N</span>
          <input inputMode="numeric" value={values.sptN} onChange={setStr("sptN")} />
          {errors.sptN && <em>{errors.sptN}</em>}
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          {editing ? "保存分层" : "加入分层"}
        </button>
      </div>
    </div>
  );
}
