// 钻孔编录领域模型：一口孔（Borehole）包含若干按深度排列的分层（Layer）

export interface Layer {
  id: string;
  top: number; // 层顶深度 m
  bottom: number; // 层底深度 m
  category: string; // 岩性分类（黏土 / 粉砂 / 卵石 …）
  color: string; // 土色
  state: string; // 状态描述（中密 / 硬塑 …）
  description: string; // 岩性描述
  sptDepth: number | null; // 标贯点深度 m（位于本层段内）
  sptN: number | null; // 标贯击数
}

export interface Borehole {
  id: string;
  code: string; // 钻孔编号
  depth: number; // 孔深 m
  waterLevel: number | null; // 地下水位埋深 m
  location: string; // 孔位 / 备注
  createdAt: number;
  layers: Layer[];
}

export interface StoreData {
  holes: Borehole[];
}
