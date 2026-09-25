// 岩土钻孔编录领域模型：一口孔包含若干分层与标贯记录，分层按深度从浅到深排列

export interface SptRecord {
  id: string;
  depth: number; // 标贯点深度 m（落于所属分层孔段内）
  n: number; // 标贯击数
}

export interface Layer {
  id: string;
  bottom: number; // 层底深度 m；层顶深度恒等于上一层底（首层顶为 0），故不单独存储
  lithology: string; // 岩性分类，如 粉质黏土、粉砂、卵石
  density: string; // 状态/密实度，如 可塑、中密
  color: string; // 土色
  description: string; // 岩性描述
  spt: SptRecord | null;
}

export interface Borehole {
  id: string;
  code: string; // 钻孔编号，如 ZK-25
  totalDepth: number; // 设计/实际孔深 m
  waterLevel: number | null; // 地下水位埋深 m
  createdAt: number;
  layers: Layer[];
}

export type FieldErrors = Record<string, string>;
