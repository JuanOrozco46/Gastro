import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/useApp';
import type { Story, StoryItem } from '../types';
import { X, ChevronLeft, ChevronRight, Zap, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StoriesBarProps {
  onOrderProduct: (productId: string, tenantSlug: string) => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({ onOrderProduct }) => {
  const { stories, tenants } = useApp();
  const [activeStory, setActiveStory] = useState<{ story: Story; itemIndex: number } | null>(null);

  // Tenant slug map lookup
  const getSlug = (tenantId: string) => {
    const t = tenants.find(t => t.id === tenantId);
    return t ? t.slug : 'la-trattoria';
  };

  const handleNextItem = useCallback(() => {
    if (!activeStory) return;
    const { story, itemIndex } = activeStory;
    const items = story.items || [];
    if (itemIndex < items.length - 1) {
      setActiveStory({ story, itemIndex: itemIndex + 1 });
    } else {
      // Move to next story if available
      const currentIndex = stories.findIndex(s => s.id === story.id);
      if (currentIndex < stories.length - 1) {
        setActiveStory({ story: stories[currentIndex + 1], itemIndex: 0 });
      } else {
        setActiveStory(null);
      }
    }
  }, [activeStory, stories]);

  const handlePrevItem = () => {
    if (!activeStory) return;
    const { story, itemIndex } = activeStory;
    if (itemIndex > 0) {
      setActiveStory({ story, itemIndex: itemIndex - 1 });
    } else {
      const currentIndex = stories.findIndex(s => s.id === story.id);
      if (currentIndex > 0) {
        const prevStory = stories[currentIndex - 1];
        const prevItems = prevStory.items || [];
        setActiveStory({ story: prevStory, itemIndex: Math.max(0, prevItems.length - 1) });
      }
    }
  };

  // Auto advance story timer
  useEffect(() => {
    if (!activeStory) return;
    const timer = setTimeout(() => {
      handleNextItem();
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeStory, handleNextItem]);

  if (!stories || stories.length === 0) return null;

  return (
    <>
      <div className="gf-stories-section">
        <div className="gf-stories-title-row">
          <span className="gf-stories-badge">
            <Flame size={13} />
            EN VIVO HOY
          </span>
          <span className="gf-stories-subtitle">Reels & cocinas en tiempo real</span>
        </div>

        <div className="gf-stories-scroll">
          {stories.map((story, idx) => {
            const items = story.items || [];
            const firstItem = items[0];
            return (
              <motion.button
                key={story.id}
                className="gf-story-avatar-btn"
                onClick={() => {
                  if (items.length > 0) {
                    setActiveStory({ story, itemIndex: 0 });
                  }
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
              >
                <div className={`gf-story-ring ${story.isLive ? 'is-live' : ''}`}>
                  <div className="gf-story-thumb">
                    {firstItem?.image ? (
                      <img loading="lazy" decoding="async" src={firstItem.image} alt={story.tenantName} />
                    ) : (
                      <span className="gf-story-emoji-fallback">{story.emoji}</span>
                    )}
                  </div>
                </div>
                <span className="gf-story-name">{story.tenantName}</span>
                {story.isLive && <span className="gf-story-live-dot">LIVE</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Story Modal Player ── */}
      <AnimatePresence>
        {activeStory && (() => {
          const items = activeStory.story.items || [];
          const currentItem: StoryItem | undefined = items[activeStory.itemIndex];
          if (!currentItem) return null;
          const canOrderStoryItem = Boolean(currentItem.productId && currentItem.productId !== '0' && currentItem.price > 0);

          return (
            <motion.div
              className="gf-story-viewer-overlay"
              onClick={() => setActiveStory(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="gf-story-viewer-container"
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
              >
                {/* Progress bar */}
                <div className="gf-story-progress-bar">
                  {items.map((_, idx) => (
                    <div
                      key={idx}
                      className={`gf-story-progress-segment ${
                        idx < activeStory.itemIndex ? 'completed' : idx === activeStory.itemIndex ? 'active' : ''
                      }`}
                    />
                  ))}
                </div>

                {/* Top Header */}
                <div className="gf-story-viewer-header">
                  <div className="gf-story-author-info">
                    <span className="gf-story-author-emoji">{currentItem.tenantEmoji}</span>
                    <div>
                      <strong>{currentItem.tenantName}</strong>
                      <span className="gf-story-time">{currentItem.timeAgo}</span>
                    </div>
                  </div>
                  <button className="gf-story-close-btn" onClick={() => setActiveStory(null)} aria-label="Cerrar historia">
                    <X size={20} />
                  </button>
                </div>

                {/* Media Content */}
                <div className="gf-story-media-container">
                  {currentItem.mediaUrl ? (
                    <video
                      preload="none"
                      poster={currentItem.image}
                      src={currentItem.mediaUrl}
                      autoPlay
                      muted
                      className="gf-story-media-video"
                    />
                  ) : currentItem.legacyExternalYoutubeId ? (
                    <div className="gf-story-legacy-fallback">
                      <p>Este reel antiguo ya no está disponible en GastroSync.</p>
                    </div>
                  ) : (
                    <img loading="lazy" decoding="async" src={currentItem.image} alt={currentItem.dishName} className="gf-story-media-img" />
                  )}

                  {/* Left/Right Click zones for stories */}
                  <button className="gf-story-nav-zone prev" onClick={handlePrevItem} aria-label="Historia anterior">
                    <ChevronLeft size={24} />
                  </button>
                  <button className="gf-story-nav-zone next" onClick={handleNextItem} aria-label="Historia siguiente">
                    <ChevronRight size={24} />
                  </button>
                </div>

                {/* Footer CTA */}
                <div className="gf-story-viewer-footer">
                  <div className="gf-story-dish-meta">
                    <h4>{currentItem.dishName}</h4>
                    {canOrderStoryItem ? (
                      <span className="gf-story-dish-price">${currentItem.price.toLocaleString('es-CO')} COP</span>
                    ) : (
                      <span className="gf-story-dish-ref">Historia de cocina</span>
                    )}
                  </div>
                  {canOrderStoryItem && (
                    <motion.button
                      className="gf-story-buy-btn"
                      onClick={() => {
                        onOrderProduct(currentItem.productId, getSlug(currentItem.tenantId));
                        setActiveStory(null);
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Zap size={16} fill="currentColor" />
                      <span>Pedir Ahora</span>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
};
