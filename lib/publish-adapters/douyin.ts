/**
 * 抖音直发适配器(v12.189)—— 与 youtube.ts 同哲学:
 *   · 只消费用户自配凭据(DOUYIN_ACCESS_TOKEN + DOUYIN_OPEN_ID,抖音开放平台自获;
 *     本产品**不代做 OAuth**——回调需公网备案域名,token 自持更安全可控)。
 *   · 无凭据 → isConfigured()=false → manual 降级带指引,绝不假称 published。
 *   · 真上传两步:upload_video(multipart)→ create_video(挂标题);需 opts.confirmed=true。
 * 官方 API:open.douyin.com /api/douyin/v1/video/upload_video/ + /create_video/。
 */
import type { PublishAdapter, UploadOptions, UploadResult } from './types';
import { safeFetch } from '../ssrf-guard';
import type { PublishPackage } from '../publish-package';

const UPLOAD_URL = 'https://open.douyin.com/api/douyin/v1/video/upload_video/';
const CREATE_URL = 'https://open.douyin.com/api/douyin/v1/video/create_video/';

export interface DouyinDeps {
  fetchImpl?: typeof fetch;
  readVideo?: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  getCreds?: () => { token?: string; openId?: string };
}

async function defaultReadVideo(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (/^https?:\/\//.test(url)) {
    // v12.241(清门禁存量债):拉取的是**外部媒体 URL**,改走 safeFetch —— 字面量+DNS 双层判定并逐跳重验重定向。
  const res = await safeFetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`读取成片失败 HTTP ${res.status}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'video/mp4' };
  }
  const fs = await import('fs/promises');
  const buf = await fs.readFile(url.replace(/^file:\/\//, ''));
  return { bytes: new Uint8Array(buf), contentType: 'video/mp4' };
}

const MANUAL_GUIDE = [
  '1. 抖音开放平台(developer.open-douyin.com)创建应用,申请 video.create 权限',
  '2. 完成 OAuth 授权拿 access_token 与 open_id(或用官方调试工具)',
  '3. 填入 .env.local:DOUYIN_ACCESS_TOKEN= / DOUYIN_OPEN_ID= 后重试即直发',
  '4. 或:打开抖音创作服务平台(creator.douyin.com)手动上传本包成片与文案',
];

export function createDouyinAdapter(deps: DouyinDeps = {}): PublishAdapter {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readVideo = deps.readVideo ?? defaultReadVideo;
  const getCreds = deps.getCreds ?? (() => ({ token: process.env.DOUYIN_ACCESS_TOKEN, openId: process.env.DOUYIN_OPEN_ID }));

  const manual = (message: string): UploadResult =>
    ({ status: 'manual', externalUrl: null, externalId: null, message, instructions: MANUAL_GUIDE });

  return {
    platform: 'douyin',
    label: '抖音',
    mode: 'api',
    isConfigured: () => { const c = getCreds(); return !!(c.token && c.openId); },
    async upload(pkg: PublishPackage, opts?: UploadOptions): Promise<UploadResult> {
      const { token, openId } = getCreds();
      if (!token || !openId) return manual('未配置抖音凭据(DOUYIN_ACCESS_TOKEN/OPEN_ID),已降级手动包');
      if (!opts?.confirmed) return manual('真 API 直发需显式确认(confirmed=true),已降级手动包');
      const videoUrl = pkg.video?.url;
      if (!videoUrl) return manual('包内无成片 URL');
      try {
        // 步骤 1:上传视频字节
        const { bytes, contentType } = await readVideo(videoUrl);
        const form = new FormData();
        form.append('video', new Blob([bytes as BlobPart], { type: contentType }), 'final.mp4');
        const upRes = await fetchImpl(`${UPLOAD_URL}?open_id=${encodeURIComponent(openId)}`, {
          method: 'POST', headers: { 'access-token': token }, body: form,
        });
        const upJson: any = await upRes.json();
        const videoId = upJson?.data?.video?.video_id;
        if (!videoId) return manual(`上传失败:${upJson?.data?.description || upJson?.message || upRes.status}`);
        // 步骤 2:创建投稿
        const crRes = await fetchImpl(`${CREATE_URL}?open_id=${encodeURIComponent(openId)}`, {
          method: 'POST', headers: { 'access-token': token, 'Content-Type': 'application/json' },
          // v12.222 合规:强制注入 AI 生成标识(《互联网信息服务深度合成管理规定》第17条)。
          // 本平台成片皆 AIGC,create_video 恒带 aigc_info 声明,不给运营者「忘标」的机会。
          body: JSON.stringify({ video_id: videoId, text: (pkg.title || '').slice(0, 55), aigc_info: { created_by_ai: true } }),
        });
        const crJson: any = await crRes.json();
        const itemId = crJson?.data?.item_id;
        if (!itemId) return manual(`创建投稿失败:${crJson?.data?.description || crRes.status}`);
        return { status: 'published', externalId: itemId, externalUrl: null, message: `抖音投稿已创建(item_id=${itemId},审核后可见)` };
      } catch (e) {
        return manual(`直发异常:${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}`);
      }
    },
    async status(externalId: string) {
      return { state: 'submitted', url: undefined }; // 抖音查询需 item 权限,MVP 返回已提交
    },
  };
}
