'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, WarningCircle as AlertCircle, ArrowsOutSimple as Maximize2 } from '@phosphor-icons/react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { getToken } from '@/lib/auth';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  title?: string;
}

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image')) return false;
  if (url.startsWith('data:')) return false;
  // Local API serve endpoint (FFmpeg composed videos)
  if (url.startsWith('/api/serve-file')) return true;
  // Real video file extensions
  if (/\.(mp4|webm|mov|avi|mkv|m3u8|ts)(\?|#|$)/i.test(url)) return true;
  // Known video CDN patterns
  if (/oss.*aliyuncs\.com|cos\..+myqcloud\.com|vod\.|video\./i.test(url)) return true;
  // HTTP URLs that are NOT image extensions → likely video
  if (url.startsWith('http') && !/\.(jpg|jpeg|png|gif|svg|webp|bmp|ico|tiff)(\?|#|$)/i.test(url)) return true;
  return false;
}

export function VideoModal({ open, onOpenChange, src, title }: Props) {
  const [videoError, setVideoError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [playSrc, setPlaySrc] = useState(src);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // ?path= 需要登录 + 签名；<video src> 带不上 Bearer → 用 fetch+blob 兜底。?key= 可直链。
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setVideoError(false);

    (async () => {
      if (!src) {
        setPlaySrc('');
        return;
      }
      if (!src.startsWith('/api/serve-file?path=')) {
        setPlaySrc(src);
        return;
      }
      try {
        const t = getToken();
        const res = await fetch(src, {
          credentials: 'include',
          headers: t ? { Authorization: `Bearer ${t}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPlaySrc(objectUrl);
      } catch (e) {
        console.warn('[VideoModal] path= fetch failed:', e);
        if (!cancelled) {
          setPlaySrc(src);
          setVideoError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleClose = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    // Pause video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    onOpenChange(false);
  }, [onOpenChange]);

  const handleVideoError = () => {
    console.warn('[VideoModal] Video playback failed:', src?.slice(0, 100));
    setVideoError(true);
  };

  // v10.3.6 a11y: Escape + 焦点陷阱 + 焦点归还(替代原 document Escape 监听)
  const dialogRef = useFocusTrap<HTMLDivElement>(open && mounted, handleClose);

  if (!open || !mounted) return null;

  const isVideo = isVideoUrl(src);

  // 使用 Portal 直接渲染到 body，彻底避免 React Flow CSS transform 的影响
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99999 }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 背景遮罩 — 点击关闭 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        style={{ animation: 'fadeIn 0.15s ease' }}
        onClick={handleClose}
      />

      {/* 视频容器 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || '视频预览'}
        tabIndex={-1}
        className="relative w-[90vw] max-w-5xl rounded-2xl overflow-hidden bg-black border border-white/8 shadow-2xl outline-none"
        style={{ animation: 'zoomIn 0.2s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部操作栏 */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
          {title && (
            <span className="text-xs text-white/80 font-medium px-2">{title}</span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {isVideo && !videoError && playSrc.startsWith('http') && (
              <a
                href={playSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="在新窗口中打开"
              >
                <Maximize2 className="w-3.5 h-3.5 text-white/70" />
              </a>
            )}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* 视频/图片内容 */}
        {isVideo && !videoError ? (
          <video
            ref={videoRef}
            key={playSrc}
            src={playSrc}
            controls
            autoPlay
            playsInline
            className="w-full aspect-video bg-black"
            onError={handleVideoError}
          />
        ) : isVideo && videoError ? (
          <div className="w-full aspect-video bg-black flex flex-col items-center justify-center gap-3 px-8 text-center">
            <AlertCircle className="w-8 h-8 text-yellow-500/60" />
            <p className="text-sm text-gray-300 font-medium">视频加载失败</p>
            <div className="text-xs text-gray-400 leading-relaxed max-w-md">
              {src.startsWith('/api/serve-file?path=') ? (
                <>
                  成片地址是临时 path 链接（需登录验签），浏览器直链常失败。
                  <br />
                  <span className="text-yellow-300/70">
                    请刷新工坊/素材库后再播（已持久化为 key 的成片可直接播放）；或打开素材库筛选「成片」。
                  </span>
                </>
              ) : src.includes('minimax') || src.includes('aliyuncs') ? (
                <>
                  上游 CDN URL 已过期(Minimax 视频通常 24h 后失效)。
                  <br />
                  <span className="text-yellow-300/70">解决方案:点项目页&quot;重新生成此镜&quot;重跑视频环节。</span>
                </>
              ) : !src ? (
                <>
                  成片地址为空 — 上游视频 API 全部失败(可能是 quota 不足或网络异常)。
                  <br />
                  <span className="text-yellow-300/70">解决方案:去 /dashboard/billing 检查余额后重跑。</span>
                </>
              ) : (
                <>视频源不可访问。可能是 CORS / 文件不存在 / 网络异常。</>
              )}
            </div>
            {src && (
              <a
                href={src.startsWith('/api/serve-file?key=') ? src : '/dashboard/assets'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                {src.startsWith('/api/serve-file?key=') ? '在新窗口中打开视频' : '打开素材库'}
              </a>
            )}
          </div>
        ) : (
          <img loading="lazy" decoding="async" src={src} alt={title || ''} className="w-full aspect-video object-contain bg-black" />
        )}
      </div>
    </div>,
    document.body
  );
}
