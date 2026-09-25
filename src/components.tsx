import { useEffect, useState } from "react";
import type { Borehole, FieldErrors } from "./types";
import { validateHole, validateLayer, validateSpt, type LayerContext } from "./domain";

// 常用岩性分类，供录入时快速选择（黏土/粉砂/卵石/强风化均可命中筛选）
const LITHOLOGY_PRESETS = [
  "黏土",
  "粉质黏土",
  "粉土",
  "粉砂",
  "细砂",
  "中砂",
  "粗砂",
  "砾砂",
  "卵石",
  "强风化泥岩",
  "强风化砂岩",
  "中风化砂岩",
];

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <em className="field-error">{msg}</em>;
}

function inputClass(errors: FieldErrors, key: string): string {
  return errors[key] ? "input-error" : "";
}

// ---- 通用弹窗 ------------------------------------------------------------------

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- 钻孔新增/编辑弹窗 ---------------------------------------------------------

export interface HoleDraft {
  code: string;
  totalDepth: string;
  waterLevel: string;
}

export function HoleFormModal({
  initial,
  existing,
  editingId,
  onClose,
  onSave,
}: {
  initial: HoleDraft;
  existing: Borehole[];
  editingId?: string;
  onClose: () => void;
  onSave: (v: { code: string; totalDepth: number; waterLevel: number | null }) => void;
}) {
  const [draft, setDraft] = useState<HoleDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = (key: keyof HoleDraft, v: string) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const submit = () => {
    const { values, errors: next } = validateHole(draft, existing, editingId);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave(values);
  };

  return (
    <Modal title={editingId ? "编辑钻孔" : "新增钻孔"} onClose={onClose}>
      <div className="form-stack">
        <label>
          <span>钻孔编号 *</span>
          <input
            className={inputClass(errors, "code")}
            value={draft.code}
            placeholder="如 ZK-25"
            onChange={(e) => set("code", e.target.value)}
            autoFocus
          />
          <FieldError msg={errors.code} />
        </label>
        <label>
          <span>孔深（m）*</span>
          <input
            className={inputClass(errors, "totalDepth")}
            inputMode="decimal"
            value={draft.totalDepth}
            placeholder="如 25.0"
            onChange={(e) => set("totalDepth", e.target.value)}
          />
          <FieldError msg={errors.totalDepth} />
        </label>
        <label>
          <span>地下水位埋深（m，未测可留空）</span>
          <input
            className={inputClass(errors, "waterLevel")}
            inputMode="decimal"
            value={draft.waterLevel}
            placeholder="如 3.4"
            onChange={(e) => set("waterLevel", e.target.value)}
          />
          <FieldError msg={errors.waterLevel} />
        </label>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary-action" onClick={submit}>
          保存
        </button>
      </div>
    </Modal>
  );
}

// ---- 分层表单（新增与编辑共用）-------------------------------------------------

export interface LayerDraft {
  bottom: string;
  lithology: string;
  density: string;
  color: string;
  description: string;
}

export const emptyLayerDraft: LayerDraft = {
  bottom: "",
  lithology: "",
  density: "",
  color: "",
  description: "",
};

export function LayerForm({
  mode,
  ctx,
  initial,
  onCancel,
  onSave,
}: {
  mode: "create" | "edit";
  ctx: LayerContext;
  initial: LayerDraft;
  onCancel: () => void;
  onSave: (v: Omit<import("./types").Layer, "id" | "spt">) => void;
}) {
  const [draft, setDraft] = useState<LayerDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof LayerDraft, v: string) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const submit = () => {
    const { values, errors: next } = validateLayer(draft, ctx);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave(values);
  };

  return (
    <div className="inline-form">
      <div className="inline-form-title">
        {mode === "create" ? "新增分层" : "编辑分层"}
        <span className="seg-hint">
          本层顶 {ctx.top} m（自动接上上一层底）
          {ctx.nextTop !== undefined ? `，下一层顶 ${ctx.nextTop} m` : ""}
        </span>
      </div>
      <div className="form-grid">
        <label>
          <span>层底深度（m）*</span>
          <input
            className={inputClass(errors, "bottom")}
            inputMode="decimal"
            value={draft.bottom}
            placeholder={`须大于 ${ctx.top}`}
            onChange={(e) => set("bottom", e.target.value)}
            autoFocus
          />
          <FieldError msg={errors.bottom} />
        </label>
        <label>
          <span>岩性分类 *</span>
          <input
            className={inputClass(errors, "lithology")}
            list="lithology-presets"
            value={draft.lithology}
            placeholder="如 粉质黏土 / 粉砂 / 卵石"
            onChange={(e) => set("lithology", e.target.value)}
          />
          <datalist id="lithology-presets">
            {LITHOLOGY_PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <FieldError msg={errors.lithology} />
        </label>
        <label>
          <span>状态/密实度 *</span>
          <input
            className={inputClass(errors, "density")}
            value={draft.density}
            placeholder="如 可塑 / 中密 / 密实"
            onChange={(e) => set("density", e.target.value)}
          />
          <FieldError msg={errors.density} />
        </label>
        <label>
          <span>土色</span>
          <input
            className={inputClass(errors, "color")}
            value={draft.color}
            placeholder="如 褐黄"
            onChange={(e) => set("color", e.target.value)}
          />
          <FieldError msg={errors.color} />
        </label>
        <label className="full-span">
          <span>岩性描述</span>
          <textarea
            rows={2}
            value={draft.description}
            placeholder="夹杂物、风化程度、芯样采取率等"
            onChange={(e) => set("description", e.target.value)}
          />
          <FieldError msg={errors.description} />
        </label>
      </div>
      <div className="inline-form-actions">
        <button onClick={onCancel}>取消</button>
        <button className="primary-action" onClick={submit}>
          {mode === "create" ? "追加分层" : "保存修改"}
        </button>
      </div>
    </div>
  );
}

// ---- 标贯录入表单（挂在某一分层上）---------------------------------------------

export interface SptDraft {
  depth: string;
  n: string;
}

export function SptForm({
  seg,
  initial,
  onCancel,
  onSave,
}: {
  seg: { top: number; bottom: number };
  initial?: { depth: number; n: number };
  onCancel: () => void;
  onSave: (v: { depth: number; n: number }) => void;
}) {
  const [draft, setDraft] = useState<SptDraft>({
    depth: initial ? String(initial.depth) : "",
    n: initial ? String(initial.n) : "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = () => {
    const { values, errors: next } = validateSpt(draft, seg);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave(values);
  };

  return (
    <div className="inline-form spt-form">
      <div className="inline-form-title">
        {initial ? "编辑标贯" : "新增标贯"}
        <span className="seg-hint">
          深度须落在当前孔段 {seg.top} – {seg.bottom} m 内
        </span>
      </div>
      <div className="form-grid">
        <label>
          <span>标贯点深度（m）*</span>
          <input
            className={inputClass(errors, "depth")}
            inputMode="decimal"
            value={draft.depth}
            placeholder={`${seg.top} ~ ${seg.bottom}`}
            onChange={(e) => setDraft((d) => ({ ...d, depth: e.target.value }))}
            autoFocus
          />
          <FieldError msg={errors.depth} />
        </label>
        <label>
          <span>标贯击数 N *</span>
          <input
            className={inputClass(errors, "n")}
            inputMode="numeric"
            value={draft.n}
            placeholder="正整数"
            onChange={(e) => setDraft((d) => ({ ...d, n: e.target.value }))}
          />
          <FieldError msg={errors.n} />
        </label>
      </div>
      <div className="inline-form-actions">
        <button onClick={onCancel}>取消</button>
        <button className="primary-action" onClick={submit}>
          保存标贯
        </button>
      </div>
    </div>
  );
}
