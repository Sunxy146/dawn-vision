'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ReactFlowProvider } from '@xyflow/react';
import { AgentChat } from '@/components/agent-chat';
import { PipelineCanvas, buildInitialNodes, initialEdges } from '@/components/pipeline-canvas';
import { Mascot } from '@/components/mascot';
import { useProjectWorkspaceStore } from '@/lib/store';
import { applyProgressToNodes } from '@/lib/resume-workshop';
import { type Project } from '@/types/agents';
import { ArrowLineLeft as PanelLeftClose, ArrowLineRight as PanelLeftOpen, DotsThree as MoreHorizontal, ShareNetwork as Share2, Play, FilmStrip as Film, CaretDown as ChevronDown, CaretUp as ChevronUp, Download, Plus, FolderOpen } from '@phosphor-icons/react';
import { VideoModal } from '@/components/ui/video-modal';
import { OverallProgressBar } from '@/components/ui/overall-progress';
import { WorkspaceHotkeys } from '@/components/workspace-hotkeys';

interface Props {
  project: Project;
  /** 离开画布，打开创意输入页（新建一轮） */
  onNewCreation?: () => void;
  /** 有分镜无视频时：续跑主管线视频阶段 */
  onContinueVideo?: () => void;
  continueBusy?: boolean;
}

export function CreationWorkspace({ project, onNewCreation, onContinueVideo, continueBusy }: Props) {
  // 移动端默认收起 chat 面板
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [selectedVideoSrc, setSelectedVideoSrc] = useState('');
  const [selectedVideoTitle, setSelectedVideoTitle] = useState('');
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const { setCurrentProject, setNodes, setEdges, assets, isProducing } = useProjectWorkspaceStore();

  const needsVideo = useMemo(() => {
    const hasSb = assets.some(
      (a) =>
        a.type === 'storyboard'
        && !!(a.mediaUrls?.[0] || (a as any).persistentUrl),
    );
    const hasVid = assets.some((a) => a.type === 'video' && !!(a.mediaUrls?.[0] || (a as any).persistentUrl));
    // 有分镜行、尚无成片视频 → 显示续跑（即使部分镜还没图）
    const hasSbRow = assets.some((a) => a.type === 'storyboard');
    return (hasSb || hasSbRow) && !hasVid;
  }, [assets]);

  useEffect(() => {
    setCurrentProject(project);
    // 必须走 applyProgressToNodes：否则会把恢复好的剪辑师/成片状态盖成「等待视频生成完成」
    // 仅在切换项目时重建；生产过程中由 SSE 更新节点，勿依赖 assets 以免冲掉进行中状态
    const currentAssets = useProjectWorkspaceStore.getState().assets;
    const nodes = applyProgressToNodes(buildInitialNodes(currentAssets), currentAssets, null);
    setNodes(nodes);
    setEdges(initialEdges);
  }, [project.id]);

  const mascotMood = isProducing ? 'working' : 'completed';

  // 时间线镜头数据
  const timelineShots = useMemo(() => {
    const videoAssets = assets.filter(a => a.type === 'video' && a.mediaUrls?.[0]);
    const storyboardAssets = assets.filter(a => a.type === 'storyboard');
    return videoAssets.map(v => {
      const sb = storyboardAssets.find(s => s.shotNumber === v.shotNumber);
      return {
        shotNumber: v.shotNumber || 0,
        videoUrl: v.mediaUrls?.[0] || '',
        description: sb?.data?.description || v.name || `镜头 ${v.shotNumber}`,
        duration: v.data?.duration || 8,
        status: v.data?.status || 'pending',
        cameraAngle: sb?.data?.planData?.cameraAngle || '',
      };
    }).sort((a, b) => a.shotNumber - b.shotNumber);
  }, [assets]);

  const handleShotPlay = (videoUrl: string, shotNumber: number) => {
    if (videoUrl && !videoUrl.startsWith('data:')) {
      setSelectedVideoSrc(videoUrl);
      setSelectedVideoTitle(`镜头 ${shotNumber}`);
      setVideoModalOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <WorkspaceHotkeys />
      {/* 顶部工具栏 */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-white/[0.04] bg-[#0A0A0B]/80 backdrop-blur-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70 shrink-0"
            title={chatOpen ? '收起对话面板' : '展开对话面板'}
          >
            {chatOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-white/90 tracking-tight truncate">{project.title || '未命名项目'}</h1>
            <div className="text-[10px] text-white/25 font-medium tracking-wider uppercase">创作中</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {needsVideo && onContinueVideo && (
            <button
              type="button"
              onClick={() => onContinueVideo()}
              disabled={!!continueBusy || isProducing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cinema-amber)]/20 hover:bg-[var(--cinema-amber)]/30 text-[12px] text-[var(--cinema-amber)] font-medium transition-all border border-[var(--cinema-amber)]/40 disabled:opacity-50"
              title="从断点续跑：跳过已有分镜，开始图生视频"
            >
              <Play className="w-3.5 h-3.5" weight="fill" />
              {continueBusy || isProducing ? '视频生成中…' : '继续生成视频'}
            </button>
          )}
          <Link
            href={`/projects/${encodeURIComponent(project.id)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[12px] text-white/50 hover:text-white/80 transition-all border border-transparent hover:border-white/[0.06]"
            title="打开项目详情"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            项目详情
          </Link>
          {onNewCreation && (
            <button
              type="button"
              onClick={onNewCreation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[12px] text-white/50 hover:text-white/80 transition-all border border-transparent hover:border-white/[0.06]"
              title="回到创意输入页，开新一轮"
            >
              <Plus className="w-3.5 h-3.5" />
              新建创作
            </button>
          )}
          <Mascot mood={mascotMood} />
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[12px] text-white/50 hover:text-white/70 transition-all border border-transparent hover:border-white/[0.06]">
            <Share2 className="w-3 h-3" />
            分享
          </button>
          <button className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-white/30 hover:text-white/60">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 断点续跑：全宽条，避免顶栏小按钮找不到 */}
      {needsVideo && onContinueVideo && (
        <div className="shrink-0 px-4 py-3 border-b border-[var(--cinema-amber)]/30 bg-[var(--cinema-amber)]/15">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-5xl mx-auto">
            <div className="flex-1 min-w-0 text-[13px] text-white/80">
              <div className="font-semibold text-[var(--cinema-amber)]">断点：分镜已就绪，视频未开始</div>
              <div className="text-[11px] text-white/45 mt-0.5">点下方按钮续跑图生视频（跳过已有分镜）</div>
            </div>
            <button
              type="button"
              onClick={() => onContinueVideo()}
              disabled={!!continueBusy || isProducing}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--cinema-amber)] text-black text-[13px] font-semibold hover:brightness-110 disabled:opacity-50"
            >
              <Play className="w-4 h-4" weight="fill" />
              {continueBusy || isProducing ? '正在请求视频管线…' : '继续生成视频'}
            </button>
          </div>
        </div>
      )}

      {/* 总体进度条 — 替代每节点独立条,展示阶段+整体 */}
      <OverallProgressBar />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {chatOpen && (
          <div className="w-full md:w-[340px] shrink-0 border-r border-white/[0.04] overflow-hidden bg-[#0C0C0C]/50 absolute md:relative inset-y-0 left-0 z-30 md:z-0">
            <AgentChat />
          </div>
        )}
        <div className="flex-1 relative flex flex-col">
          <div className="flex-1">
            <ReactFlowProvider>
              <PipelineCanvas />
            </ReactFlowProvider>
          </div>

          {/* ═══ 时间线面板 ═══ */}
          {timelineShots.length > 0 && (
            <div className={`shrink-0 border-t border-white/[0.04] bg-[#0C0C0C]/95 backdrop-blur-xl transition-all duration-300 ${timelineOpen ? 'max-h-[130px]' : 'max-h-[34px]'} overflow-hidden`}>
              {/* Timeline header */}
              <button
                onClick={() => setTimelineOpen(!timelineOpen)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Film className="w-3 h-3 text-[#E8C547]/60" />
                  <span className="font-medium">时间线</span>
                  <span className="text-[10px] text-white/20">
                    {timelineShots.length} 镜头 · {timelineShots.reduce((s, t) => s + t.duration, 0)}s
                  </span>
                </div>
                {timelineOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>

              {/* Timeline strip */}
              {timelineOpen && (
                <div className="px-4 pb-2.5 overflow-x-auto custom-scrollbar">
                  <div className="flex gap-1.5 min-w-min">
                    {timelineShots.map((shot, i) => {
                      const isVideoReady = shot.videoUrl && !shot.videoUrl.startsWith('data:');
                      return (
                        <div
                          key={shot.shotNumber}
                          className={`shrink-0 w-[130px] rounded-lg overflow-hidden border transition-all cursor-pointer group
                            ${isVideoReady
                              ? 'border-white/[0.06] hover:border-white/15 hover:shadow-lg'
                              : 'border-white/[0.03] opacity-40'}`}
                          onClick={() => isVideoReady && handleShotPlay(shot.videoUrl, shot.shotNumber)}
                        >
                          <div className="flex items-center justify-between px-2 py-1 bg-white/[0.02]">
                            <span className="text-[9px] font-bold text-[#E8C547]/70">S{shot.shotNumber}</span>
                            <span className="text-[8px] text-white/20">{shot.duration}s</span>
                          </div>
                          <div className="h-[55px] bg-black/30 relative flex items-center justify-center">
                            {isVideoReady ? (
                              <>
                                <video src={shot.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                                  <Play className="w-4 h-4 text-white/80" />
                                </div>
                              </>
                            ) : (
                              <div className="text-[8px] text-white/20">
                                {isProducing ? '生成中...' : '待生成'}
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1 bg-white/[0.015]">
                            <div className="text-[8px] text-white/30 truncate">{shot.description.slice(0, 18)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video playback modal */}
      <VideoModal
        open={videoModalOpen}
        onOpenChange={setVideoModalOpen}
        src={selectedVideoSrc}
        title={selectedVideoTitle}
      />
    </div>
  );
}
