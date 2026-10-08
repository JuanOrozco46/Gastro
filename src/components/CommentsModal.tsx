import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import type { Post, PostComment, Tenant } from '../types';
import { X, Send, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { suggestUsernameFromName } from '../utils/formValidation';

interface CommentsModalProps {
  post: Post;
  tenant?: Tenant;
  onClose: () => void;
}

function isImageUrl(val?: string): boolean {
  if (!val) return false;
  return val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/') || val.startsWith('blob:');
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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

  const isPostRestaurantMember = Boolean(
    currentUser &&
    ((currentUser.tenantId && currentUser.tenantId === post.tenantId &&
      (currentUser.businessRole === 'restaurant_owner' ||
       currentUser.businessRole === 'restaurant_staff' ||
       currentUser.role === 'admin' ||
       currentUser.role === 'kitchen')) ||
     (tenant?.ownerUserId && currentUser.id && tenant.ownerUserId === currentUser.id))
  );

  const canDeleteComment = (c: PostComment): boolean => {
    if (!currentUser) return false;
    const isCommentAuthor = Boolean(
      (c.userId && (c.userId === currentUser.id || c.userId === currentUser.email)) ||
      (!c.userId && (
        c.userName === currentUser.name ||
        (c.userHandle && currentUser.username && c.userHandle === currentUser.username) ||
        c.userName === 'Tú (Cliente)'
      ))
    );
    return isCommentAuthor || isPostRestaurantMember;
  };

  const currentUserHandle = currentUser?.username || (currentUser?.name ? suggestUsernameFromName(currentUser.name) : '');

  return (
    <div className="gf-comments-overlay" onClick={onClose}>
      <div className="gf-comments-drawer" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="gf-comments-header">
          <div className="gf-comments-title">
            <MessageCircle size={18} />
            <h3>Comentarios ({comments.length})</h3>
          </div>
          <button className="gf-comments-close" onClick={onClose} aria-label="Cerrar comentarios">
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
            comments.map(c => {
              const avatarImg = c.userAvatarUrl || (isImageUrl(c.userAvatar) ? c.userAvatar : undefined);
              const handleStr = c.userHandle || suggestUsernameFromName(c.userName);
              const deletable = canDeleteComment(c);

              return (
                <div key={c.id} className="gf-comment-item">
                  <div
                    className="gf-comment-avatar"
                    style={{
                      overflow: 'hidden',
                      padding: 0,
                      border: avatarImg ? '1.5px solid rgba(200, 169, 126, 0.45)' : undefined
                    }}
                  >
                    {avatarImg ? (
                      <img
                        src={avatarImg}
                        alt={c.userName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : c.userAvatar && c.userAvatar !== '🥑' ? (
                      <span>{c.userAvatar}</span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#d4a359' }}>
                        {getInitials(c.userName)}
                      </span>
                    )}
                  </div>
                  <div className="gf-comment-content">
                    <div className="gf-comment-author-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      <strong className="gf-comment-author">{c.userName}</strong>
                      {handleStr && (
                        <span
                          style={{
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            color: '#d4a359',
                            background: 'rgba(212, 163, 89, 0.12)',
                            border: '1px solid rgba(212, 163, 89, 0.25)',
                            padding: '1px 7px',
                            borderRadius: '999px'
                          }}
                        >
                          @{handleStr}
                        </span>
                      )}
                      <span className="gf-comment-time">{c.timeAgo}</span>
                    </div>
                    <p className="gf-comment-text">{c.text}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <button className="gf-comment-like-btn" type="button" aria-label="Me gusta comentario">
                      <Heart size={14} />
                      {c.likes > 0 && <span>{c.likes}</span>}
                    </button>
                    {deletable && (
                      <button
                        type="button"
                        className="gf-comment-like-btn"
                        onClick={() => deleteComment(post.id, c.id)}
                        style={{ color: 'var(--danger)' }}
                        title={isPostRestaurantMember && c.userId !== currentUser?.id ? 'Eliminar comentario (Restaurante)' : 'Eliminar mi comentario'}
                        aria-label="Eliminar comentario"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* New Comment Input */}
        <form className="gf-comments-form" onSubmit={handleSubmit}>
          {currentUser && (
            <div
              title={currentUserHandle ? `@${currentUserHandle}` : currentUser.name}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                background: 'rgba(212, 163, 89, 0.16)',
                border: '1.5px solid rgba(212, 163, 89, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#d4a359'
              }}
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                getInitials(currentUser.name)
              )}
            </div>
          )}
          <input
            type="text"
            className="gf-comment-input"
            placeholder={
              currentUser
                ? `Comentar como ${currentUserHandle ? `@${currentUserHandle}` : currentUser.name}...`
                : 'Escribe un comentario...'
            }
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
