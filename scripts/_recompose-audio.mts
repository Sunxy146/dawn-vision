/**
 * 重合成：保留源片音轨，落盘为 ?key= 可播成片。
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { upsertAsset } from '../lib/repos/asset-repo';
import { HybridOrchestrator } from '../services/hybrid-orchestrator';
import { persistAsset } from '../lib/asset-storage';

const PROJECT_ID = process.env.PROJECT_ID || 'proj-1788712839337';

function parseJson(s: string | null | undefined): any {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

function assetVideoUrl(row: any): string {
  const pu = row.persistent_url || '';
  let media: string[] = [];
  try { media = JSON.parse(row.media_urls || '[]'); } catch { media = []; }
  if (pu && (pu.startsWith('/api/serve-file') || pu.startsWith('http'))) return pu;
  const http = media.find((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  if (http) return http;
  return media[0] || pu || '';
}

async function main() {
  const scriptRow = db.prepare(
    `SELECT data FROM project_assets WHERE project_id=? AND type='script' ORDER BY updated_at DESC LIMIT 1`,
  ).get(PROJECT_ID) as any;
  const script = parseJson(scriptRow?.data);
  if (!script?.shots?.length) throw new Error('no script shots');

  const videoRows = db.prepare(
    `SELECT * FROM project_assets WHERE project_id=? AND type='video' ORDER BY shot_number ASC`,
  ).all(PROJECT_ID) as any[];

  const byShot = new Map<number, any>();
  for (const r of videoRows) {
    const sn = r.shot_number ?? 0;
    const prev = byShot.get(sn);
    if (!prev || String(r.updated_at || '') >= String(prev.updated_at || '')) byShot.set(sn, r);
  }

  const videos = [...byShot.values()]
    .map((r) => {
      const d = parseJson(r.data);
      return {
        shotNumber: r.shot_number ?? 0,
        videoUrl: assetVideoUrl(r),
        duration: d.duration ?? 5,
        status: d.status || 'completed',
        coverImageUrl: d.coverImageUrl ?? null,
      };
    })
    .filter((v) => !!v.videoUrl)
    .sort((a, b) => a.shotNumber - b.shotNumber);

  console.log('clips', videos.length, videos.map((v) => v.shotNumber));

  // 跳过配乐 LLM：Minimax 关时会失败拖时间；本次只要源片有声
  process.env.SKIP_BGM = process.env.SKIP_BGM || '1';

  const orch = new HybridOrchestrator(PROJECT_ID);
  const t0 = Date.now();
  const editResult = await orch.runEditor(videos as any, script);
  console.log('compose ms', Date.now() - t0);
  console.log({
    final: (editResult.finalVideoUrl || '').slice(0, 120),
    dur: editResult.totalDuration,
    hasBgm: (editResult as any).hasBgm,
    hasVo: (editResult as any).hasVoiceover,
  });

  let finalUrl = editResult.finalVideoUrl || '';
  if (finalUrl.startsWith('/api/serve-file?path=')) {
    const persisted = await persistAsset(finalUrl, { contentType: 'video/mp4', ext: '.mp4' });
    if (persisted?.url) {
      finalUrl = persisted.url;
      editResult.finalVideoUrl = finalUrl;
      console.log('persisted', finalUrl);
    }
  }

  await upsertAsset({
    projectId: PROJECT_ID,
    type: 'timeline',
    name: '时间线',
    data: editResult as any,
    mediaUrls: [],
  });

  await upsertAsset({
    projectId: PROJECT_ID,
    type: 'final_video',
    name: '最终成片',
    data: {
      composedAt: new Date().toISOString(),
      source: 'recompose-keep-audio',
      duration: editResult.totalDuration,
      clipCount: editResult.videoCount,
      hasSourceAudio: true,
    },
    mediaUrls: [finalUrl],
    persistentUrl: finalUrl,
    confirmed: true,
  });

  // probe bitrate
  const key = finalUrl.match(/key=([a-f0-9]+)/i)?.[1];
  if (key) {
    const p = path.join(process.cwd(), 'data', 'storage', 'assets', `${key}.mp4`);
    console.log('file exists', fs.existsSync(p), p);
  }
  console.log('done', finalUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
