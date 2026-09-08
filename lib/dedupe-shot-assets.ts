/**
 * 同镜号多条资产去重（重生曾 create 新行导致 UI 叠卡片）。
 * 优先保留有图的一条，并把兄弟行里的描述/规划字段合并进来。
 */
export type ShotKeyedAsset = {
  id?: string;
  type?: string;
  shotNumber?: number | null;
  mediaUrls?: string[] | null;
  data?: any;
  updatedAt?: string;
  createdAt?: string;
};

function hasMedia(a: ShotKeyedAsset): boolean {
  return Array.isArray(a.mediaUrls) && a.mediaUrls.some((u) => typeof u === 'string' && u.length > 0);
}

function textLen(a: ShotKeyedAsset): number {
  const d = a.data || {};
  return String(d.description || d.prompt || d.visualPrompt || '').trim().length;
}

function pickBase(a: ShotKeyedAsset, b: ShotKeyedAsset): ShotKeyedAsset {
  const am = hasMedia(a);
  const bm = hasMedia(b);
  if (am !== bm) return am ? a : b;
  const ad = textLen(a);
  const bd = textLen(b);
  if (ad !== bd) return ad > bd ? a : b;
  const at = a.updatedAt || a.createdAt || '';
  const bt = b.updatedAt || b.createdAt || '';
  return bt >= at ? b : a;
}

function mergeShotGroup<T extends ShotKeyedAsset>(group: T[]): T {
  const base = group.reduce((acc, cur) => pickBase(acc, cur) as T);
  const data = { ...(base.data || {}) };
  for (const g of group) {
    const d = g.data || {};
    if (!data.description && d.description) data.description = d.description;
    if (!data.prompt && d.prompt) data.prompt = d.prompt;
    if (!data.visualPrompt && d.visualPrompt) data.visualPrompt = d.visualPrompt;
    if (!data.planData && d.planData) data.planData = d.planData;
    if (data.duration == null && d.duration != null) data.duration = d.duration;
    if (!data.cameraSpec && d.cameraSpec) data.cameraSpec = d.cameraSpec;
    if (!data.cameraAngle && d.cameraAngle) data.cameraAngle = d.cameraAngle;
    // cameo 痕迹：有分数的优先
    if (data.cameoScore == null && d.cameoScore != null) data.cameoScore = d.cameoScore;
  }
  // prompt 与 description 互填，避免界面只读其一
  if (!data.description && data.prompt) data.description = data.prompt;
  if (!data.prompt && data.description) data.prompt = data.description;
  return { ...base, data };
}

/** 按 shotNumber 去重；无镜号的条目原样保留。 */
export function dedupeAssetsByShotNumber<T extends ShotKeyedAsset>(assets: T[]): T[] {
  const groups = new Map<number, T[]>();
  const noShot: T[] = [];
  for (const a of assets) {
    const sn = a.shotNumber;
    if (typeof sn !== 'number' || !Number.isFinite(sn) || sn <= 0) {
      noShot.push(a);
      continue;
    }
    const list = groups.get(sn) || [];
    list.push(a);
    groups.set(sn, list);
  }
  const merged = Array.from(groups.values()).map((g) => mergeShotGroup(g));
  return [...merged, ...noShot].sort(
    (x, y) => (x.shotNumber || 0) - (y.shotNumber || 0),
  );
}
