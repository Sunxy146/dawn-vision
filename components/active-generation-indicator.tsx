'use client';

/**
 * components/active-generation-indicator (v12.5.0 · #4 修复)
 *
 * 工坊「进行中任务」全局浮动指示条 —— 挂在 dashboard layout,任一模块都可见。
 * 解决「工坊任务进行中点其他模块就像中断了」:任务其实仍在跑(SSE 闭包不随页面卸载停),
 * 这条指示让用户随时看到进度 + 一键返回工坊;离开/刷新前给原生警告防误关。
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CircleNotch, ArrowRight, FilmSlate } from '@phosphor-icons/react';
import { useActiveGenerationStore, readLastWorkshop } from '@/lib/store';

export function ActiveGenerationIndicator() {
  const current = useActiveGenerationStore((s) => s.current);
  const hydrate = useActiveGenerationStore((s) => s.hydrate);
  const pathname = usePathname();
  const router = useRouter();
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastIdea, setLastIdea] = useState('');

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    const last = readLastWorkshop();
    setLastId(last?.projectId || null);
    setLastIdea(last?.idea || '');
  }, [current, pathname]);

  useEffect(() => {
    if (!current) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [current]);

  if (pathname === '/dashboard/create') return null;

  const projectId = current?.projectId || lastId;
  if (!projectId) return null;

  const running = !!current;
  const idea = current?.idea || lastIdea;
  const phase = current?.phase || '可继续';

  return (
    <button
      onClick={() => router.push(`/dashboard/create?resume=${encodeURIComponent(projectId)}`)}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-[var(--cinema-amber)] bg-[var(--cinema-bg,#0c0c10)]/95 px-4 py-2.5 shadow-lg shadow-black/40 backdrop-blur transition hover:scale-[1.02]"
      title={running ? '工坊任务进行中 — 点击返回' : '返回最近一次创作工坊'}
    >
      {running ? (
        <CircleNotch size={16} className="animate-spin text-[var(--cinema-amber)]" weight="bold" />
      ) : (
        <FilmSlate size={16} className="text-[var(--cinema-amber)]" weight="duotone" />
      )}
      <span className="flex flex-col items-start leading-tight">
        <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--cinema-amber)]">
          <FilmSlate size={12} />
          {running ? `工坊任务进行中 · ${phase}` : '返回创作工坊'}
        </span>
        <span className="max-w-[200px] truncate text-[10px] opacity-60">{idea || projectId}</span>
      </span>
      <ArrowRight size={14} className="opacity-70" />
    </button>
  );
}
