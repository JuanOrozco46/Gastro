import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/useApp';
import type { Story, StoryItem } from '../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Sparkles,
  Heart,
  ShoppingBag
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface StoriesBarProps {
  onOrderProduct: (productId: string, tenantSlug: string) => void;
  onOpenRestaurantProfile?: (tenantId: string) => void;
  targetTenantStoryId?: string | null;
  onTargetTenantStoryConsumed?: () => void;
}

const PHOTO_STORY_DURATION_MS = 6000;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const StoriesBar: React.FC<StoriesBarProps> = ({
  onOrderProduct,
  onOpenRestaurantProfile,
  targetTenantStoryId,
  onTargetTenantStoryConsumed
}) => {
  const { stories, tenants, selectedCityId, selectedZoneId } = useApp();
  const prefersReducedMotion = useReducedMotion();

  const [activeStory, setActiveStory] = useState<{ story: Story; itemIndex: number } | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [tenantTransition, setTenantTransition] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoldingUiHidden, setIsHoldingUiHidden] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [likedStoryItemIds, setLikedStoryItemIds] = useState<string[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const wasHeldRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // Ordenar historias no vistas primero y vistas al final (patrón Instagram)
  const orderedStories = useMemo(() => {
    const unviewed: Story[] = [];
    const viewed: Story[] = [];
    for (const st of cityFilteredStories) {
      if (viewedStoryIds.includes(st.id)) {
        viewed.push(st);
      } else {
        unviewed.push(st);
      }
    }
    return [...unviewed, ...viewed];
  }, [cityFilteredStories, viewedStoryIds]);

  const updateTrayScrollArrows = useCallback(() => {
    const el = trayScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateTrayScrollArrows();
    window.addEventListener('resize', updateTrayScrollArrows);
    return () => window.removeEventListener('resize', updateTrayScrollArrows);
  }, [orderedStories.length, updateTrayScrollArrows]);

  const scrollTrayBy = (delta: number) => {
    trayScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

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

  const openStory = useCallback((story: Story, startIndex = 0) => {
    const items = story.items || [];
    if (items.length === 0) return;
    setDirection(1);
    setTenantTransition(false);
    resetProgress();
    setIsPaused(false);
    setIsHoldingUiHidden(false);
    setActiveStory({ story, itemIndex: startIndex });
    markStoryViewed(story.id);
  }, [markStoryViewed, resetProgress]);

  useEffect(() => {
    if (!targetTenantStoryId) return;
    const match = cityFilteredStories.find(
      s => s.tenantId === targetTenantStoryId || s.id === targetTenantStoryId
    );
    if (match && (match.items || []).length > 0) {
      queueMicrotask(() => {
        openStory(match, 0);
      });
    }
    onTargetTenantStoryConsumed?.();
  }, [targetTenantStoryId, cityFilteredStories, onTargetTenantStoryConsumed, openStory]);

  const jumpToRestaurantStory = useCallback(
    (targetStory: Story, dir: 1 | -1) => {
      const items = targetStory.items || [];
      if (items.length === 0) return;
      setDirection(dir);
      setTenantTransition(true);
      resetProgress();
      setIsPaused(false);
      setIsHoldingUiHidden(false);
      setActiveStory({ story: targetStory, itemIndex: 0 });
      markStoryViewed(targetStory.id);
    },
    [markStoryViewed, resetProgress]
  );

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
      const currentIndex = orderedStories.findIndex(s => s.id === story.id);
      if (currentIndex >= 0 && currentIndex < orderedStories.length - 1) {
        const nextStory = orderedStories[currentIndex + 1];
        setTenantTransition(true);
        setActiveStory({ story: nextStory, itemIndex: 0 });
        markStoryViewed(nextStory.id);
      } else {
        setActiveStory(null);
      }
    }
  }, [resolvedActiveStory, orderedStories, markStoryViewed, resetProgress]);

  const handlePrevItem = useCallback(() => {
    if (!resolvedActiveStory) return;
    const { story, itemIndex } = resolvedActiveStory;
    setDirection(-1);
    resetProgress();

    if (itemIndex > 0) {
      setTenantTransition(false);
      setActiveStory({ story, itemIndex: itemIndex - 1 });
    } else {
      const currentIndex = orderedStories.findIndex(s => s.id === story.id);
      if (currentIndex > 0) {
        const prevStory = orderedStories[currentIndex - 1];
        const prevItems = prevStory.items || [];
        setTenantTransition(true);
        setActiveStory({ story: prevStory, itemIndex: Math.max(0, prevItems.length - 1) });
        markStoryViewed(prevStory.id);
      }
    }
  }, [resolvedActiveStory, orderedStories, markStoryViewed, resetProgress]);

  const jumpToSegment = (targetIdx: number) => {
    if (!resolvedActiveStory || targetIdx === resolvedActiveStory.itemIndex) return;
    setDirection(targetIdx > resolvedActiveStory.itemIndex ? 1 : -1);
    setTenantTransition(false);
    resetProgress();
    setActiveStory({ story: resolvedActiveStory.story, itemIndex: targetIdx });
  };

  // Pre-carga inteligente de la siguiente imagen para transiciones instantáneas sin parpadeo
  useEffect(() => {
    if (!resolvedActiveStory) return;
    const { story, itemIndex } = resolvedActiveStory;
    const items = story.items || [];
    const preloadUrls: string[] = [];

    if (itemIndex + 1 < items.length && items[itemIndex + 1]?.image) {
      preloadUrls.push(items[itemIndex + 1].image);
    }
    const currentStoryIdx = orderedStories.findIndex(s => s.id === story.id);
    if (currentStoryIdx >= 0 && currentStoryIdx + 1 < orderedStories.length) {
      const nextFirstImg = orderedStories[currentStoryIdx + 1]?.items?.[0]?.image;
      if (nextFirstImg) preloadUrls.push(nextFirstImg);
    }

    preloadUrls.forEach(url => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  }, [resolvedActiveStory, orderedStories]);

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

  const currentStoryIdx = resolvedActiveStory
    ? orderedStories.findIndex(s => s.id === resolvedActiveStory.story.id)
    : -1;
  const prevRestaurantStory =
    currentStoryIdx > 0 ? orderedStories[currentStoryIdx - 1] : null;
  const nextRestaurantStory =
    currentStoryIdx >= 0 && currentStoryIdx < orderedStories.length - 1
      ? orderedStories[currentStoryIdx + 1]
      : null;

  const handlePointerHoldStart = (e: React.PointerEvent<HTMLDivElement>) => {
    wasHeldRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      wasHeldRef.current = true;
      setIsPaused(true);
      setIsHoldingUiHidden(true);
    }, 160);
  };

  const handlePointerHoldEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (wasHeldRef.current) {
      setIsPaused(false);
      setIsHoldingUiHidden(false);
    }

    if (pointerStartRef.current) {
      const deltaX = e.clientX - pointerStartRef.current.x;
      const deltaY = e.clientY - pointerStartRef.current.y;
      pointerStartRef.current = null;

      // Swipe vertical hacia abajo para cerrar (estilo Instagram)
      if (deltaY > 75 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
        wasHeldRef.current = true;
        setActiveStory(null);
        return;
      }
      // Swipe horizontal para saltar entre restaurantes
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        wasHeldRef.current = true;
        if (deltaX < 0 && nextRestaurantStory) {
          jumpToRestaurantStory(nextRestaurantStory, 1);
        } else if (deltaX > 0 && prevRestaurantStory) {
          jumpToRestaurantStory(prevRestaurantStory, -1);
        }
      }
    }
  };

  const toggleStoryItemLike = (itemId: string) => {
    setLikedStoryItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  if (!orderedStories || orderedStories.length === 0) return null;

  return (
    <>
      <div className="gf-stories-section">
        <div className="gf-stories-tray-wrap">
          {canScrollLeft && (
            <button
              type="button"
              className="gf-stories-tray-arrow left"
              onClick={() => scrollTrayBy(-260)}
              aria-label="Desplazar historias a la izquierda"
            >
              <ChevronLeft size={16} />
            </button>
          )}

          <div
            ref={trayScrollRef}
            className="gf-stories-scroll"
            onScroll={updateTrayScrollArrows}
          >
            {orderedStories.map((story, idx) => {
              const items = story.items || [];
              const firstItem = items[0];
              const isViewed = viewedStoryIds.includes(story.id);
              const tenant = tenants.find(t => t.id === story.tenantId || t.slug === story.tenantId);
              const thumbUrl = tenant?.logoUrl || firstItem?.image;

              return (
                <motion.button
                  key={story.id}
                  type="button"
                  className={`gf-story-avatar-btn ${isViewed ? 'is-viewed' : ''}`}
                  onClick={() => openStory(story, 0)}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(idx * 0.035, 0.25),
                    ease: EASE_OUT_EXPO
                  }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.93 }}
                >
                  <div className={`gf-story-ring ${!isViewed ? 'is-live' : 'is-seen'}`}>
                    <div className="gf-story-thumb">
                      {thumbUrl ? (
                        <img loading="lazy" decoding="async" src={thumbUrl} alt={story.tenantName} />
                      ) : (
                        <span className="gf-story-emoji-fallback">{story.emoji}</span>
                      )}
                    </div>
                    {items.length > 1 && (
                      <span className="gf-story-slides-count" title={`${items.length} historias activas`}>
                        {items.length}
                      </span>
                    )}
                    {story.isLive && !isViewed && <span className="gf-story-live-dot">VIVO</span>}
                  </div>
                  <span className="gf-story-name">{story.tenantName}</span>
                </motion.button>
              );
            })}
          </div>

          {canScrollRight && (
            <button
              type="button"
              className="gf-stories-tray-arrow right"
              onClick={() => scrollTrayBy(260)}
              aria-label="Desplazar historias a la derecha"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Story Fullscreen Player with Instagram 9:16 Stage & Desktop Peek Cards ── */}
      <AnimatePresence>
        {resolvedActiveStory && (() => {
          const items = resolvedActiveStory.story.items || [];
          const currentItem: StoryItem | undefined = items[resolvedActiveStory.itemIndex];
          if (!currentItem) return null;
          const canOrderStoryItem = Boolean(
            currentItem.productId && currentItem.productId !== '0' && currentItem.price > 0
          );
          const slideKey = `${resolvedActiveStory.story.id}_${currentItem.id}_${resolvedActiveStory.itemIndex}`;
          const isCurrentItemLiked = likedStoryItemIds.includes(currentItem.id);
          const activeTenant = tenants.find(
            t => t.id === resolvedActiveStory.story.tenantId || t.slug === resolvedActiveStory.story.tenantId
          );

          return (
            <motion.div
              className="gf-story-viewer-overlay"
              onClick={() => setActiveStory(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            >
              <div className="gf-story-viewer-stage" onClick={e => e.stopPropagation()}>
                {/* Tarjeta lateral izquierda (Restaurante anterior en Desktop estilo Instagram Web) */}
                {prevRestaurantStory && prevRestaurantStory.items?.[0] && (
                  <button
                    type="button"
                    className="gf-story-peek-card prev"
                    onClick={() => jumpToRestaurantStory(prevRestaurantStory, -1)}
                    aria-label={`Ver historia anterior de ${prevRestaurantStory.tenantName}`}
                  >
                    {prevRestaurantStory.items[0].image && (
                      <img
                        src={prevRestaurantStory.items[0].image}
                        alt={prevRestaurantStory.tenantName}
                        className="gf-story-peek-bg"
                      />
                    )}
                    <div className="gf-story-peek-overlay">
                      <div className="gf-story-peek-ring">
                        <span>{prevRestaurantStory.emoji}</span>
                      </div>
                      <strong className="gf-story-peek-name">{prevRestaurantStory.tenantName}</strong>
                      <span className="gf-story-peek-time">{prevRestaurantStory.items[0].timeAgo}</span>
                    </div>
                  </button>
                )}

                <motion.div
                  className={`gf-story-viewer-container ${isHoldingUiHidden ? 'is-ui-hidden' : ''}`}
                  onPointerDown={handlePointerHoldStart}
                  onPointerUp={handlePointerHoldEnd}
                  onPointerCancel={handlePointerHoldEnd}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.93, y: 20 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.95, y: 20 }
                  }
                  transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                >
                  {/* Synchronized Segmented Progress Bar */}
                  <div className="gf-story-progress-bar gf-story-chrome" role="tablist" aria-label="Progreso de historias">
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
                  <div className="gf-story-viewer-header gf-story-chrome">
                    <motion.button
                      key={resolvedActiveStory.story.id}
                      type="button"
                      className="gf-story-author-info"
                      onClick={() => {
                        if (onOpenRestaurantProfile) {
                          const targetId = resolvedActiveStory.story.tenantId;
                          setActiveStory(null);
                          onOpenRestaurantProfile(targetId);
                        }
                      }}
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                    >
                      <span className="gf-story-author-emoji">
                        {activeTenant?.logoUrl ? (
                          <img src={activeTenant.logoUrl} alt={currentItem.tenantName} />
                        ) : (
                          currentItem.tenantEmoji
                        )}
                      </span>
                      <div className="gf-story-author-meta">
                        <div className="gf-story-author-title-row">
                          <strong>{currentItem.tenantName}</strong>
                          <span className="gf-story-time">{currentItem.timeAgo}</span>
                        </div>
                        <span className="gf-story-sub-meta">
                          {isPaused ? 'En pausa · ' : ''}
                          {activeTenant?.category || 'Cocina en vivo'}
                        </span>
                      </div>
                    </motion.button>

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

                  {/* Animated Media Stage (9:16 Full-bleed Canvas) */}
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
                                x: direction >= 0 ? (tenantTransition ? 96 : 36) : (tenantTransition ? -96 : -36),
                                scale: tenantTransition ? 0.92 : 0.98
                              }
                        }
                        animate={{
                          opacity: 1,
                          x: 0,
                          scale: 1
                        }}
                        exit={
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                x: direction >= 0 ? -36 : 36,
                                scale: 0.98
                              }
                        }
                        transition={{
                          duration: tenantTransition ? 0.34 : 0.24,
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
                            initial={prefersReducedMotion ? false : { scale: 1.005 }}
                            animate={
                              prefersReducedMotion || isPaused
                                ? { scale: 1.01 }
                                : { scale: 1.05 }
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
                          className="gf-story-caption-pill gf-story-chrome"
                          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                        >
                          <Sparkles size={13} />
                          <span>{currentItem.caption}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Zonas de Tap asimétricas estilo Instagram: 30% izq (atrás) / 70% der (adelante) */}
                    <button
                      type="button"
                      className="gf-story-nav-zone prev"
                      onClick={() => {
                        if (!wasHeldRef.current) handlePrevItem();
                      }}
                      aria-label="Historia anterior"
                    >
                      <span className="gf-story-nav-pill">
                        <ChevronLeft size={18} />
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
                        <ChevronRight size={18} />
                      </span>
                    </button>
                  </div>

                  {/* Floating Bottom Bar (Instagram Story Action Bar) */}
                  <motion.div
                    key={`footer_${slideKey}`}
                    className="gf-story-viewer-footer gf-story-chrome"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
                  >
                    <div className="gf-story-dish-meta">
                      <div className="gf-story-dish-tag">
                        <ShoppingBag size={12} />
                        <span>{canOrderStoryItem ? 'Disponible hoy' : 'Especial de cocina'}</span>
                      </div>
                      <h4>{currentItem.dishName}</h4>
                      {canOrderStoryItem ? (
                        <span className="gf-story-dish-price">
                          ${currentItem.price.toLocaleString('es-CO')} COP
                        </span>
                      ) : (
                        <span className="gf-story-dish-ref">
                          {nextRestaurantStory
                            ? `Siguiente: ${nextRestaurantStory.tenantName} →`
                            : 'Historia 24h en tiempo real'}
                        </span>
                      )}
                    </div>

                    <div className="gf-story-footer-actions">
                      <button
                        type="button"
                        className={`gf-story-like-btn ${isCurrentItemLiked ? 'liked' : ''}`}
                        onClick={() => toggleStoryItemLike(currentItem.id)}
                        aria-label="Me gusta esta historia"
                      >
                        <Heart
                          size={20}
                          fill={isCurrentItemLiked ? 'currentColor' : 'none'}
                          strokeWidth={isCurrentItemLiked ? 0 : 2}
                        />
                      </button>

                      {canOrderStoryItem && (
                        <motion.button
                          type="button"
                          className="gf-story-buy-btn"
                          onClick={() => {
                            onOrderProduct(currentItem.productId, getSlug(currentItem.tenantId));
                            setActiveStory(null);
                          }}
                          whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                        >
                          <Zap size={15} fill="currentColor" />
                          <span>Pedir Ahora</span>
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                </motion.div>

                {/* Tarjeta lateral derecha (Restaurante siguiente en Desktop estilo Instagram Web) */}
                {nextRestaurantStory && nextRestaurantStory.items?.[0] && (
                  <button
                    type="button"
                    className="gf-story-peek-card next"
                    onClick={() => jumpToRestaurantStory(nextRestaurantStory, 1)}
                    aria-label={`Ver siguiente historia de ${nextRestaurantStory.tenantName}`}
                  >
                    {nextRestaurantStory.items[0].image && (
                      <img
                        src={nextRestaurantStory.items[0].image}
                        alt={nextRestaurantStory.tenantName}
                        className="gf-story-peek-bg"
                      />
                    )}
                    <div className="gf-story-peek-overlay">
                      <div className="gf-story-peek-ring">
                        <span>{nextRestaurantStory.emoji}</span>
                      </div>
                      <strong className="gf-story-peek-name">{nextRestaurantStory.tenantName}</strong>
                      <span className="gf-story-peek-time">{nextRestaurantStory.items[0].timeAgo}</span>
                    </div>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
};
