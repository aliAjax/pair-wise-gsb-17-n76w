import { useState } from "react";
import type { Borehole } from "../types";
import { validateHole, type Errors, type HoleFormValues } from "../domain";

interface Props {
  holes: Borehole[];
  editing?: Borehole | null;
  onSubmit: (values: HoleFormValues) => void;
  onCancel: () => void;
}

const EMPTY: HoleFormValues = { code: "", depth: "", waterLevel: "", location: "" };

export default function HoleForm({ holes, editing, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<HoleFormValues>(
    editing
      ? {
          code: editing.code,
          depth: String(editing.depth),
          waterLevel: editing.waterLevel === null ? "" : String(editing.waterLevel),
          location: editing.location,
        }
      : EMPTY
  );
  const [errors, setErrors] = useState<Errors<"code" | "depth" | "waterLevel">>({});

  const set = (key: keyof HoleFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = () => {
    const next = validateHole(values, holes, editing?.id ?? null);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  };

  return (
    <div className="form-card">
      <div className="form-title">
        <h3>{editing ? `编辑钻孔 ${editing.code}` : "新增钻孔"}</h3>
        <button className="link-btn" onClick={onCancel}>取消</button>
      </div>
      <div className="field-grid">
        <label className={errors.code ? "field-error" : ""}>
          <span>钻孔编号 *</span>
          <input placeholder="如 ZK-25" value={values.code} onChange={set("code")} />
          {errors.code && <em>{errors.code}</em>}
        </label>
        <label className={errors.depth ? "field-error" : ""}>
          <span>孔深 (m) *</span>
          <input inputMode="decimal" placeholder="如 24.0" value={values.depth} onChange={set("depth")} />
          {errors.depth && <em>{errors.depth}</em>}
        </label>
        <label className={errors.waterLevel ? "field-error" : ""}>
          <span>地下水位埋深 (m)</span>
          <input
            inputMode="decimal"
            placeholder="须落在孔段内，可暂不填"
            value={values.waterLevel}
            onChange={set("waterLevel")}
          />
          {errors.waterLevel && <em>{errors.waterLevel}</em>}
        </label>
        <label>
          <span>孔位 / 备注</span>
          <input placeholder="如 主楼东南角" value={values.location} onChange={set("location")} />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          {editing ? "保存修改" : "建立钻孔"}
        </button>
      </div>
    </div>
  );
}
