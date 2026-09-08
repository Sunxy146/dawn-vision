/**
 * 给缺图分镜补渲:读 prompt → wan2.6-t2i → 落盘 → 写回 media_urls
 * 用法: node --import tsx scripts/backfill-storyboard-images.ts <projectId>
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 加载 .env.local
for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

const projectId = process.argv[2] || 'proj-1785424493768';

async function main() {
  const Database = (await import('better-sqlite3')).default;
  const { generateDashscopeImage } = await import('../lib/image-providers/dashscope-qwen-image');
  const { persistAsset } = await import('../lib/asset-storage');
  const { updateAsset } = await import('../lib/repos/asset-repo');

  const db = new Database('data/qfmj.db');
  const rows = db
    .prepare(
      `SELECT id, shot_number, name, media_urls, data FROM project_assets
       WHERE project_id = ? AND type = 'storyboard' ORDER BY shot_number`,
    )
    .all(projectId) as Array<{ id: string; shot_number: number; name: string; media_urls: string; data: string }>;

  console.log(`project=${projectId} storyboards=${rows.length}`);

  for (const row of rows) {
    let media: string[] = [];
    try {
      media = JSON.parse(row.media_urls || '[]');
    } catch {
      media = [];
    }
    if (media[0] && !String(media[0]).startsWith('data:')) {
      console.log(`skip shot ${row.shot_number}: already has ${String(media[0]).slice(0, 60)}`);
      continue;
    }

    let data: any = {};
    try {
      data = JSON.parse(row.data || '{}');
    } catch {
      data = {};
    }
    const prompt =
      data.description ||
      data.prompt ||
      data.planData?.visualDescription ||
      `${row.name} cinematic film still`;
    console.log(`→ shot ${row.shot_number}: ${String(prompt).slice(0, 80)}...`);

    try {
      const r = await generateDashscopeImage({
        prompt: String(prompt).slice(0, 2000),
        aspectRatio: '16:9',
        label: `Shot ${row.shot_number}`,
      });
      const persisted = await persistAsset(r.imageUrl, { ext: '.png' }).catch(() => null);
      const finalUrl = persisted?.url || r.imageUrl;
      await updateAsset(row.id, { mediaUrls: [finalUrl], persistentUrl: persisted?.url || null });
      console.log(`✓ shot ${row.shot_number}: ${finalUrl}`);
    } catch (e) {
      console.error(`✗ shot ${row.shot_number}:`, e instanceof Error ? e.message : e);
    }
  }
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
