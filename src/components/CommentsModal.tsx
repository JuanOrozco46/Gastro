import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import type { Post, Tenant } from '../types';
import { X, Send, Heart, MessageCircle, Trash2 } from 'lucide-react';

interface CommentsModalProps {
  post: Post;
  tenant?: Tenant;
  onClose: () => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({ post, tenant, onClose }) => {
  const { addComment, deleteComment, currentUser } = useApp();
  const [commentText, setCommentText] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const success = await addComment(post.id, commentText.trim());
    if (success) {
      setCommentText('');
    }
  };

  const comments = post.comments || [];

  return (
    <div className="gf-comments-overlay" onClick={onClose}>
      <div className="gf-comments-drawer" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="gf-comments-header">
          <div className="gf-comments-title">
            <MessageCircle size={18} />
            <h3>Comentarios ({comments.length})</h3>
          </div>
          <button className="gf-comments-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Post Preview Bar */}
        <div className="gf-comments-post-summary">
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: tenant?.logoUrl ? 'transparent' : 'var(--surface-color)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="gf-post-summary-emoji" style={{ margin: 0, fontSize: '1.2rem' }}>{tenant?.logoEmoji || post.tenantLogoEmoji || '🍽️'}</span>
            )}
          </div>
          <div className="gf-post-summary-text">
            <strong>{post.dishName}</strong>
            <span>{tenant?.name || post.tenantName}</span>
          </div>
          <span className="gf-post-summary-price">${post.price.toLocaleString('es-CO')}</span>
        </div>

        {/* Comments List */}
        <div className="gf-comments-list">
          {comments.length === 0 ? (
            <div className="gf-no-comments">
              <span>💬</span>
              <p>Sé el primero en comentar sobre este plato</p>
            </div>
          ) : (
            comments.map(c => (
              <div key={c.id} className="gf-comment-item">
                <div className="gf-comment-avatar">{c.userAvatar}</div>
                <div className="gf-comment-content">
                  <div className="gf-comment-author-row">
                    <strong className="gf-comment-author">{c.userName}</strong>
                    <span className="gf-comment-time">{c.timeAgo}</span>
                  </div>
                  <p className="gf-comment-text">{c.text}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <button className="gf-comment-like-btn">
                    <Heart size={14} />
                    {c.likes > 0 && <span>{c.likes}</span>}
                  </button>
                  {(c.userName === currentUser?.name || c.userName === 'Tú (Cliente)') && (
                    <button className="gf-comment-like-btn" onClick={() => deleteComment(post.id, c.id)} style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* New Comment Input */}
        <form className="gf-comments-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="gf-comment-input"
            placeholder="Escribe un comentario..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
          />
          <button type="submit" className="gf-comment-send-btn" disabled={!commentText.trim()}>
            <Send size={16} />
          </button>
        </form>

      </div>
    </div>
  );
};
