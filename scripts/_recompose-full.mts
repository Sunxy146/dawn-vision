/**
 * 用项目全部视频镜重合成最终成片（修复 serve-file?key= 本地解析后）。
 */
import path from 'node:path';
import { db } from '../lib/db';
import { upsertAsset } from '../lib/repos/asset-repo';
import { HybridOrchestrator } from '../services/hybrid-orchestrator';
import { serveFilePathUrl } from '../lib/serve-file-sign';

const PROJECT_ID = process.env.PROJECT_ID || 'proj-1788712839337';

function parseJson(s: string | null | undefined): any {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

function assetVideoUrl(row: any): string {
  const pu = row.persistent_url || '';
  let media: string[] = [];
  try { media = JSON.parse(row.media_urls || '[]'); } catch { media = []; }
  // 本地持久化优先（现已可被 composer 解析），否则 CDN
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
      const videoUrl = assetVideoUrl(r);
      return {
        shotNumber: r.shot_number ?? 0,
        videoUrl,
        duration: d.duration ?? 5,
        status: d.status || 'completed',
        coverImageUrl: d.coverImageUrl ?? null,
      };
    })
    .filter((v) => !!v.videoUrl)
    .sort((a, b) => a.shotNumber - b.shotNumber);

  console.log('clips', videos.map((v) => ({
    sn: v.shotNumber,
    mp4: /\.mp4|serve-file|dashscope/i.test(v.videoUrl),
    url: v.videoUrl.slice(0, 80),
  })));

  if (videos.length < 2) throw new Error(`only ${videos.length} videos`);

  const orch = new HybridOrchestrator(PROJECT_ID);
  // 尽量少走 LLM（配乐计划等会 403）；runEditor 内部仍可能调 LLM，可接受
  const t0 = Date.now();
  console.log('composing…');
  const editResult = await orch.runEditor(videos as any, script);
  console.log('done', Date.now() - t0, 'ms');
  console.log({
    finalVideoUrl: (editResult.finalVideoUrl || '').slice(0, 140),
    timelineLen: editResult.timeline?.length,
    totalDuration: editResult.totalDuration,
    videoCount: editResult.videoCount,
  });

  if (!editResult.finalVideoUrl) throw new Error('no finalVideoUrl');

  await upsertAsset({
    projectId: PROJECT_ID,
    type: 'timeline',
    name: '时间线',
    data: editResult as any,
    mediaUrls: [],
    confirmed: false,
  });

  await upsertAsset({
    projectId: PROJECT_ID,
    type: 'final_video',
    name: '最终成片',
    data: {
      composedAt: new Date().toISOString(),
      source: 'recompose-full-7',
      duration: editResult.totalDuration,
      clipCount: editResult.videoCount,
    },
    mediaUrls: [editResult.finalVideoUrl],
    persistentUrl: editResult.finalVideoUrl.includes('?path=')
      ? editResult.finalVideoUrl.split('&sig=')[0]
      : editResult.finalVideoUrl,
    confirmed: true,
  });

  console.log('final_video asset saved');
  // 提示本地路径
  if (editResult.finalVideoUrl.includes('path=')) {
    try {
      const u = new URL(editResult.finalVideoUrl, 'http://localhost');
      console.log('local file:', decodeURIComponent(u.searchParams.get('path') || ''));
    } catch { /* ignore */ }
  } else {
    console.log('url:', serveFilePathUrl(path.resolve('.')));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
