import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db, now } from '@/lib/db';
import { getDbDriver } from '@/lib/db-driver';
import {
  PIPELINE_STAGES, buildRerunPlan, derivePipelineStages,
  type StageAsset, type StageId,
} from '@/lib/pipeline-stages';
import { requireProjectAccess } from '@/lib/auth-guard';

export const runtime = 'nodejs';

const VALID_STAGES = new Set<StageId>(PIPELINE_STAGES.map((s) => s.id));

/** 环节额外要清掉的资产 type（不全在 assetTypes 里）。 */
const EXTRA_CLEAR: Record<StageId, string[]> = {
  script: [],
  assets: [],
  storyboard: [],
  final: ['final_video', 'timeline', 'quality_report'],
};

function assetTypesToClear(stages: StageId[]): string[] {
  const out = new Set<string>();
  for (const sid of stages) {
    const def = PIPELINE_STAGES.find((s) => s.id === sid);
    if (!def) continue;
    for (const t of def.assetTypes) out.add(t);
    for (const t of EXTRA_CLEAR[sid] || []) out.add(t);
  }
  return [...out];
}

/**
 * v6.4.1 — 单环节真重跑端点.
 * POST { stage } →
 *   1. 算重跑计划 (target + 失效下游)
 *   2. 删除 target+下游对应资产(否则续跑 checkpoint 会整段跳过,看起来像「没反应」)
 *   3. 尽力派发到活跃 orchestrator(通常无实例)
 *   4. 返回 resumeUrl,前端跳转工坊 continue=1 真正重生
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const _g = await requireProjectAccess(request, id, 'edit');
  if (!_g.ok) return NextResponse.json({ message: _g.message }, { status: _g.status });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const stage = body?.stage as StageId;

  if (!stage || !VALID_STAGES.has(stage)) {
    return NextResponse.json({ message: `stage 必须是 ${[...VALID_STAGES].join('/')}` }, { status: 400 });
  }
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id) as { id: string } | undefined;
  if (!project) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const rows = await getDbDriver().query<{ id: string; type: string; updated_at: string; stale: number }>(
    'SELECT id, type, updated_at, stale FROM project_assets WHERE project_id = ?', [id],
  );
  const assets: StageAsset[] = rows.map((r) => ({ id: r.id, type: r.type, updatedAt: r.updated_at, stale: !!r.stale }));

  const plan = buildRerunPlan(assets, stage);
  const clearTypes = assetTypesToClear([stage, ...plan.invalidates]);

  // activeOrchestrators 在 create-pipeline,不在 hybrid-orchestrator(旧代码 import 错模块 → 永远派发失败)
  let dispatched = false;
  try {
    const { activeOrchestrators } = await import('@/lib/create-pipeline');
    const inst = activeOrchestrators.get(id) as { regenerateStage?: (role: string, fb: string) => void } | undefined;
    if (inst && typeof inst.regenerateStage === 'function') {
      const roleMap: Record<StageId, string> = {
        script: 'writer',
        assets: 'character_designer',
        storyboard: 'storyboard',
        final: 'video_producer',
      };
      inst.regenerateStage(roleMap[stage], `重跑「${stage}」环节 (导演台触发)`);
      dispatched = true;
    }
  } catch { /* 无活跃实例 → 删资产 + 工坊续跑 */ }

  let cleared = 0;
  await getDbDriver().transaction(async (tx) => {
    for (const t of clearTypes) {
      const r = await tx.run('DELETE FROM project_assets WHERE project_id = ? AND type = ?', [id, t]);
      cleared += Number(r?.changes || 0);
    }
    await tx.run(
      `INSERT INTO pipeline_reruns (id, project_id, stage, invalidates, affected_asset_ids, dispatched, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nanoid(), id, stage, JSON.stringify(plan.invalidates), JSON.stringify(plan.affectedAssetIds),
        dispatched ? 1 : 0,
        dispatched
          ? `已派发活跃 orchestrator; cleared=${cleared}`
          : `已清除产物×${cleared},待工坊续跑`,
        now(),
      ],
    );
  });

  const freshRows = await getDbDriver().query<{ type: string; updated_at: string; stale: number }>(
    'SELECT type, updated_at, stale FROM project_assets WHERE project_id = ?', [id],
  );
  const stages = derivePipelineStages(freshRows.map((r) => ({ type: r.type, updatedAt: r.updated_at, stale: !!r.stale })));

  const resumeUrl = `/dashboard/create?resume=${encodeURIComponent(id)}&continue=1`;

  return NextResponse.json({
    ok: true,
    plan,
    dispatched,
    cleared,
    clearedTypes: clearTypes,
    stages,
    resumeUrl,
    message: dispatched
      ? `已派发重跑「${stage}」`
      : `已清除「${stage}」及下游产物(${cleared} 项),请在工坊续跑生成`,
  });
}
