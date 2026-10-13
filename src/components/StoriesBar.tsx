import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/useApp';
import type { Story, StoryItem } from '../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Flame,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface StoriesBarProps {
  onOrderProduct: (productId: string, tenantSlug: string) => void;
}

const PHOTO_STORY_DURATION_MS = 6000;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const StoriesBar: React.FC<StoriesBarProps> = ({ onOrderProduct }) => {
  const { stories, tenants, selectedCityId, selectedZoneId } = useApp();
  const prefersReducedMotion = useReducedMotion();

  const [activeStory, setActiveStory] = useState<{ story: Story; itemIndex: number } | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [tenantTransition, setTenantTransition] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [viewedStoryIds, setViewedStoryIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gs_viewed_stories_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const wasHeldRef = useRef(false);

  const cityFilteredStories = useMemo(() => {
    const storyTtlMs = 24 * 60 * 60 * 1000;
    return (stories || [])
      .map((story) => {
        const validItems = (story.items || []).filter(
          (item: StoryItem) =>
            typeof item.createdAt === 'number' &&
            Number.isFinite(item.createdAt) &&
            nowMs - item.createdAt < storyTtlMs
        );
        return { ...story, items: validItems };
      })
      .filter(story => {
        if (!story.items || story.items.length === 0) return false;
        const tenant = tenants.find(t => t.id === story.tenantId || t.slug === story.tenantId);
        if (!tenant || tenant.status !== 'active') return false;
        if (selectedCityId && tenant.cityId !== selectedCityId) return false;
        if (selectedZoneId && tenant.zoneId !== selectedZoneId) return false;
        return true;
      });
  }, [stories, tenants, selectedCityId, selectedZoneId, nowMs]);

  const markStoryViewed = useCallback((storyId: string) => {
    setViewedStoryIds(prev => {
      if (prev.includes(storyId)) return prev;
      const next = [...prev, storyId];
      try {
        localStorage.setItem('gs_viewed_stories_v1', JSON.stringify(next.slice(-80)));
      } catch {}
      return next;
    });
  }, []);

  const resolvedActiveStory = useMemo(() => {
    if (!activeStory) return null;
    const latest = cityFilteredStories.find(s => s.id === activeStory.story.id);
    if (!latest || (latest.items || []).length === 0) return null;
    return {
      story: latest,
      itemIndex: Math.min(activeStory.itemIndex, latest.items.length - 1)
    };
  }, [activeStory, cityFilteredStories]);

  const getSlug = (tenantId: string) => {
    const t = tenants.find(t => t.id === tenantId);
    return t ? t.slug : 'la-trattoria';
  };

  const progressRef = useRef(0);

  const resetProgress = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
  }, []);

  const openStory = (story: Story, startIndex = 0) => {
    const items = story.items || [];
    if (items.length === 0) return;
    setDirection(1);
    setTenantTransition(false);
    resetProgress();
    setIsPaused(false);
    setActiveStory({ story, itemIndex: startIndex });
    markStoryViewed(story.id);
  };

  const handleNextItem = useCallback(() => {
    if (!resolvedActiveStory) return;
    const { story, itemIndex } = resolvedActiveStory;
    const items = story.items || [];
    setDirection(1);
    resetProgress();

    if (itemIndex < items.length - 1) {
      setTenantTransition(false);
      setActiveStory({ story, itemIndex: itemIndex + 1 });
    } else {
      const currentIndex = cityFilteredStories.findIndex(s => s.id === story.id);
      if (currentIndex >= 0 && currentIndex < cityFilteredStories.length - 1) {
        const nextStory = cityFilteredStories[currentIndex + 1];
        setTenantTransition(true);
        setActiveStory({ story: nextStory, itemIndex: 0 });
        markStoryViewed(nextStory.id);
      } else {
        setActiveStory(null);
      }
    }
  }, [resolvedActiveStory, cityFilteredStories, markStoryViewed, resetProgress]);

  const handlePrevItem = useCallback(() => {
    if (!resolvedActiveStory) return;
    const { story, itemIndex } = resolvedActiveStory;
    setDirection(-1);
    resetProgress();

    if (itemIndex > 0) {
      setTenantTransition(false);
      setActiveStory({ story, itemIndex: itemIndex - 1 });
    } else {
      const currentIndex = cityFilteredStories.findIndex(s => s.id === story.id);
      if (currentIndex > 0) {
        const prevStory = cityFilteredStories[currentIndex - 1];
        const prevItems = prevStory.items || [];
        setTenantTransition(true);
        setActiveStory({ story: prevStory, itemIndex: Math.max(0, prevItems.length - 1) });
        markStoryViewed(prevStory.id);
      }
    }
  }, [resolvedActiveStory, cityFilteredStories, markStoryViewed, resetProgress]);

  const jumpToSegment = (targetIdx: number) => {
    if (!resolvedActiveStory || targetIdx === resolvedActiveStory.itemIndex) return;
    setDirection(targetIdx > resolvedActiveStory.itemIndex ? 1 : -1);
    setTenantTransition(false);
    resetProgress();
    setActiveStory({ story: resolvedActiveStory.story, itemIndex: targetIdx });
  };

  // Smooth real-time progress bar (requestAnimationFrame) + auto-advance to next story
  useEffect(() => {
    if (!resolvedActiveStory) return;
    const items = resolvedActiveStory.story.items || [];
    const currentItem = items[resolvedActiveStory.itemIndex];
    if (!currentItem) return;

    const isVideoStory = Boolean(currentItem.mediaUrl);
    if (isVideoStory && videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }

    if (isPaused) return;

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTimestamp;
      lastTimestamp = now;

      const videoEl = videoRef.current;
      if (isVideoStory && videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        const pct = Math.min(100, (videoEl.currentTime / videoEl.duration) * 100);
        progressRef.current = pct;
        setProgress(pct);
        if (pct >= 99.5 || videoEl.ended) {
          handleNextItem();
          return;
        }
      } else {
        const nextPct = progressRef.current + (delta / PHOTO_STORY_DURATION_MS) * 100;
        if (nextPct >= 100) {
          progressRef.current = 100;
          setProgress(100);
          handleNextItem();
          return;
        }
        progressRef.current = nextPct;
        setProgress(nextPct);
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [resolvedActiveStory, isPaused, handleNextItem]);

  // Keyboard navigation (ArrowRight, ArrowLeft, Space to pause, Escape to close)
  useEffect(() => {
    if (!activeStory) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveStory(null);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextItem();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevItem();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStory, handleNextItem, handlePrevItem]);

  const handlePointerHoldStart = () => {
    wasHeldRef.current = false;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      wasHeldRef.current = true;
      setIsPaused(true);
    }, 160);
  };

  const handlePointerHoldEnd = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (wasHeldRef.current) {
      setIsPaused(false);
    }
  };

  if (!cityFilteredStories || cityFilteredStories.length === 0) return null;

  const currentStoryIdx = resolvedActiveStory
    ? cityFilteredStories.findIndex(s => s.id === resolvedActiveStory.story.id)
    : -1;
  const nextRestaurantStory =
    currentStoryIdx >= 0 && currentStoryIdx < cityFilteredStories.length - 1
      ? cityFilteredStories[currentStoryIdx + 1]
      : null;

  return (
    <>
      <div className="gf-stories-section">
        <div className="gf-stories-title-row">
          <span className="gf-stories-badge">
            <Flame size={13} />
            EN VIVO HOY
          </span>
          <span className="gf-stories-subtitle">Historias 24h & cocinas en tiempo real</span>
        </div>

        <div className="gf-stories-scroll">
          {cityFilteredStories.map((story, idx) => {
            const items = story.items || [];
            const firstItem = items[0];
            const isViewed = viewedStoryIds.includes(story.id);
            return (
              <motion.button
                key={story.id}
                type="button"
                className={`gf-story-avatar-btn ${isViewed ? 'is-viewed' : ''}`}
                onClick={() => openStory(story, 0)}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.36,
                  delay: Math.min(idx * 0.045, 0.32),
                  ease: EASE_OUT_EXPO
                }}
                whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.05 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
              >
                <div className={`gf-story-ring ${story.isLive ? 'is-live' : ''} ${isViewed ? 'is-seen' : ''}`}>
                  <div className="gf-story-thumb">
                    {firstItem?.image ? (
                      <img loading="lazy" decoding="async" src={firstItem.image} alt={story.tenantName} />
                    ) : (
                      <span className="gf-story-emoji-fallback">{story.emoji}</span>
                    )}
                  </div>
                  {items.length > 1 && (
                    <span className="gf-story-slides-count" title={`${items.length} historias activas`}>
                      {items.length}
                    </span>
                  )}
                </div>
                <span className="gf-story-name">{story.tenantName}</span>
                {story.isLive && <span className="gf-story-live-dot">LIVE</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Story Fullscreen Player with Choreographed Motion ── */}
      <AnimatePresence>
        {resolvedActiveStory && (() => {
          const items = resolvedActiveStory.story.items || [];
          const currentItem: StoryItem | undefined = items[resolvedActiveStory.itemIndex];
          if (!currentItem) return null;
          const canOrderStoryItem = Boolean(
            currentItem.productId && currentItem.productId !== '0' && currentItem.price > 0
          );
          const slideKey = `${resolvedActiveStory.story.id}_${currentItem.id}_${resolvedActiveStory.itemIndex}`;

          return (
            <motion.div
              className="gf-story-viewer-overlay"
              onClick={() => setActiveStory(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            >
              <motion.div
                className="gf-story-viewer-container"
                onClick={e => e.stopPropagation()}
                onPointerDown={handlePointerHoldStart}
                onPointerUp={handlePointerHoldEnd}
                onPointerCancel={handlePointerHoldEnd}
                initial={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.92, y: 28 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.94, y: 24 }
                }
                transition={{ duration: 0.34, ease: EASE_OUT_EXPO }}
              >
                {/* Synchronized Segmented Progress Bar */}
                <div className="gf-story-progress-bar" role="tablist" aria-label="Progreso de historias">
                  {items.map((segItem, idx) => {
                    const fillPct =
                      idx < resolvedActiveStory.itemIndex
                        ? 100
                        : idx === resolvedActiveStory.itemIndex
                          ? progress
                          : 0;
                    return (
                      <button
                        key={segItem.id || idx}
                        type="button"
                        className={`gf-story-progress-segment ${
                          idx < resolvedActiveStory.itemIndex
                            ? 'completed'
                            : idx === resolvedActiveStory.itemIndex
                              ? 'active'
                              : ''
                        }`}
                        onClick={() => jumpToSegment(idx)}
                        aria-label={`Ver historia ${idx + 1} de ${items.length}`}
                      >
                        <span
                          className="gf-story-progress-fill"
                          style={{ transform: `scaleX(${fillPct / 100})` }}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Top Header with Restaurant Info + Controls */}
                <div className="gf-story-viewer-header">
                  <motion.div
                    key={resolvedActiveStory.story.id}
                    className="gf-story-author-info"
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  >
                    <span className="gf-story-author-emoji">{currentItem.tenantEmoji}</span>
                    <div>
                      <div className="gf-story-author-title-row">
                        <strong>{currentItem.tenantName}</strong>
                        <span className="gf-story-counter-pill">
                          {resolvedActiveStory.itemIndex + 1}/{items.length}
                        </span>
                      </div>
                      <span className="gf-story-time">
                        {currentItem.timeAgo}
                        { isPaused ? ' · En pausa' : '' }
                      </span>
                    </div>
                  </motion.div>

                  <div className="gf-story-header-actions">
                    {currentItem.mediaUrl && (
                      <button
                        type="button"
                        className="gf-story-ctrl-btn"
                        onClick={() => setIsMuted(m => !m)}
                        aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                        title={isMuted ? 'Activar sonido' : 'Silenciar'}
                      >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    )}

                    <button
                      type="button"
                      className="gf-story-ctrl-btn"
                      onClick={() => setIsPaused(p => !p)}
                      aria-label={isPaused ? 'Reanudar historia' : 'Pausar historia'}
                      title={isPaused ? 'Reanudar historia' : 'Pausar historia'}
                    >
                      {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    </button>

                    <button
                      type="button"
                      className="gf-story-close-btn"
                      onClick={() => setActiveStory(null)}
                      aria-label="Cerrar historia"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Animated Media Stage (Slide + Depth Transitions between items and restaurants) */}
                <div className="gf-story-media-container">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div
                      key={slideKey}
                      custom={direction}
                      className="gf-story-slide-stage"
                      initial={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              x: direction >= 0 ? (tenantTransition ? 110 : 64) : (tenantTransition ? -110 : -64),
                              scale: tenantTransition ? 0.88 : 0.95,
                              rotateY: tenantTransition ? (direction >= 0 ? 14 : -14) : 0,
                              filter: 'blur(6px)'
                            }
                      }
                      animate={{
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        rotateY: 0,
                        filter: 'blur(0px)'
                      }}
                      exit={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              x: direction >= 0 ? -56 : 56,
                              scale: 0.95,
                              filter: 'blur(4px)'
                            }
                      }
                      transition={{
                        duration: tenantTransition ? 0.44 : 0.36,
                        ease: EASE_OUT_EXPO
                      }}
                    >
                      {currentItem.mediaUrl ? (
                        <video
                          ref={videoRef}
                          preload="metadata"
                          poster={currentItem.image}
                          src={currentItem.mediaUrl}
                          autoPlay
                          playsInline
                          muted={isMuted}
                          onEnded={handleNextItem}
                          className="gf-story-media-video"
                        />
                      ) : currentItem.legacyExternalYoutubeId ? (
                        <div className="gf-story-legacy-fallback">
                          <p>Este reel antiguo ya no está disponible en GastroSync.</p>
                        </div>
                      ) : (
                        <motion.img
                          loading="eager"
                          decoding="async"
                          src={currentItem.image}
                          alt={currentItem.dishName}
                          className="gf-story-media-img"
                          initial={prefersReducedMotion ? false : { scale: 1.01 }}
                          animate={
                            prefersReducedMotion || isPaused
                              ? { scale: 1.02 }
                              : { scale: 1.065 }
                          }
                          transition={{ duration: 6, ease: 'linear' }}
                        />
                      )}

                      <div className="gf-story-vignette" />
                    </motion.div>
                  </AnimatePresence>

                  {/* Caption Overlay if present */}
                  <AnimatePresence mode="wait">
                    {currentItem.caption && (
                      <motion.div
                        key={`caption_${slideKey}`}
                        className="gf-story-caption-pill"
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.28, delay: 0.08, ease: EASE_OUT_EXPO }}
                      >
                        <Sparkles size={13} />
                        <span>{currentItem.caption}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Left/Right Click zones for stories */}
                  <button
                    type="button"
                    className="gf-story-nav-zone prev"
                    onClick={() => {
                      if (!wasHeldRef.current) handlePrevItem();
                    }}
                    aria-label="Historia anterior"
                  >
                    <span className="gf-story-nav-pill">
                      <ChevronLeft size={20} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="gf-story-nav-zone next"
                    onClick={() => {
                      if (!wasHeldRef.current) handleNextItem();
                    }}
                    aria-label="Historia siguiente"
                  >
                    <span className="gf-story-nav-pill">
                      <ChevronRight size={20} />
                    </span>
                  </button>
                </div>

                {/* Choreographed Footer CTA */}
                <motion.div
                  key={`footer_${slideKey}`}
                  className="gf-story-viewer-footer"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: 0.06, ease: EASE_OUT_EXPO }}
                >
                  <div className="gf-story-dish-meta">
                    <h4>{currentItem.dishName}</h4>
                    {canOrderStoryItem ? (
                      <span className="gf-story-dish-price">
                        ${currentItem.price.toLocaleString('es-CO')} COP
                      </span>
                    ) : (
                      <span className="gf-story-dish-ref">
                        {nextRestaurantStory
                          ? `Siguiente: ${nextRestaurantStory.tenantName} →`
                          : 'Historia de cocina en vivo'}
                      </span>
                    )}
                  </div>
                  {canOrderStoryItem && (
                    <motion.button
                      type="button"
                      className="gf-story-buy-btn"
                      onClick={() => {
                        onOrderProduct(currentItem.productId, getSlug(currentItem.tenantId));
                        setActiveStory(null);
                      }}
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.04, y: -1 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                    >
                      <Zap size={16} fill="currentColor" />
                      <span>Pedir Ahora</span>
                    </motion.button>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
};
