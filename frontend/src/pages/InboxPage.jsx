import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  CheckCheck, 
  Search, 
  ShieldCheck, 
  User, 
  Sparkles,
  ArrowLeft,
  X,
  Paperclip,
  Image as ImageIcon,
  FileVideo,
  Play,
  Trash2,
  Download,
  ExternalLink,
  Maximize2,
  ImageOff,
  ZoomIn,
  ZoomOut,
  Bot,
  CheckCircle2,
  Clock,
  Settings2
} from 'lucide-react';
import { formatIndianTime } from '../utils/indianTime';

/**
 * WhatsApp-style image card with loading shimmer, automatic fallback to proxy,
 * broken state retry, and click-to-lightbox.
 */
function ChatImageBubble({
  src,
  alt = "WhatsApp Photo",
  caption,
  time,
  isOutbound,
  onOpenLightbox,
  mediaId,
  senderName
}) {
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'loaded' | 'error'
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [imageSrc, setImageSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setImageSrc(src);
    setLoadStatus('loading');
    setRetryAttempt(0);
  }

  function handleImageError() {
    // If loading from /uploads/inbound/ failed, auto-fallback to /api/media/inbound/
    if (retryAttempt === 0) {
      setRetryAttempt(1);
      if (imageSrc && imageSrc.includes('/uploads/inbound/')) {
        const parts = imageSrc.split('/uploads/inbound/')[1];
        const extractedId = parts ? parts.split('?')[0].split('.')[0] : null;
        if (extractedId) {
          setImageSrc(`/api/media/inbound/${extractedId}?retry=1`);
          return;
        }
      } else if (mediaId) {
        setImageSrc(`/api/media/inbound/${mediaId}?retry=1`);
        return;
      }
    }
    setLoadStatus('error');
  }

  function handleManualRetry(e) {
    if (e) e.stopPropagation();
    setLoadStatus('loading');
    setRetryAttempt(prev => prev + 1);
    const separator = imageSrc.includes('?') ? '&' : '?';
    setImageSrc(`${imageSrc.split('?')[0]}${separator}t=${Date.now()}`);
  }

  return (
    <div style={{
      width: '100%',
      minWidth: '220px',
      maxWidth: '320px',
      marginBottom: caption ? '6px' : '2px'
    }}>
      {/* 1. Loading Shimmer Skeleton */}
      {loadStatus === 'loading' && (
        <div style={{
          width: '100%',
          height: '210px',
          background: 'linear-gradient(110deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite linear',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: '#64748B',
          borderRadius: '8px',
          border: '1px solid #E2E8F0'
        }}>
          <ImageIcon size={28} color="#94A3B8" className="pulse-glow" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
            Loading WhatsApp Photo...
          </span>
        </div>
      )}

      {/* 2. Error Fallback Card */}
      {loadStatus === 'error' && (
        <div style={{
          padding: '16px 12px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: '#FEE2E2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#DC2626'
          }}>
            <ImageOff size={18} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B' }}>
            Photo Unavailable
          </div>
          <div style={{ fontSize: '0.7rem', color: '#B91C1C', lineHeight: 1.35, maxWidth: '240px' }}>
            Image could not be loaded or is downloading from Meta WhatsApp servers.
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            style={{
              marginTop: '4px',
              background: '#FFFFFF',
              border: '1px solid #DC2626',
              color: '#DC2626',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={12} />
            <span>Retry Download</span>
          </button>
        </div>
      )}

      {/* 3. Loaded Image Card */}
      <div
        className="chat-image-container"
        onClick={() => {
          if (loadStatus === 'loaded') {
            onOpenLightbox({
              url: imageSrc,
              caption,
              time,
              sender: isOutbound ? 'You' : senderName,
              isOutbound
            });
          }
        }}
        style={{
          display: loadStatus === 'loaded' ? 'block' : 'none'
        }}
        title="Click to view full photo"
      >
        <img
          src={imageSrc}
          alt={caption || alt}
          onLoad={() => setLoadStatus('loaded')}
          onError={handleImageError}
          style={{
            width: '100%',
            maxHeight: '340px',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto',
            borderRadius: '8px'
          }}
          loading="eager"
        />

        {/* Hover Expand Overlay */}
        <div className="chat-image-overlay">
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            color: '#FFFFFF',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            <Maximize2 size={13} />
            <span>Click to Expand</span>
          </div>
        </div>

        {/* If NO caption: Floating timestamp pill inside the photo */}
        {!caption && (
          <div style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            background: 'rgba(15, 23, 42, 0.72)',
            color: '#FFFFFF',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.675rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none'
          }}>
            <span>{time}</span>
            {isOutbound && <CheckCheck size={12} color="#60A5FA" />}
          </div>
        )}
      </div>

      {/* Clean Caption beneath the photo */}
      {caption && (
        <div style={{
          padding: '6px 4px 2px 4px',
          fontSize: '0.85rem',
          lineHeight: 1.45,
          color: '#0F172A',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Media attachment states (Images & Videos)
  const [selectedMediaFile, setSelectedMediaFile] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'image' | 'video'

  // Lightbox modal state for full-screen image preview
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);
  const [downloadingMedia, setDownloadingMedia] = useState(false);

  // DOM element and workflow references
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialSelectionDone = useRef(false);

  // Close lightbox on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && lightboxMedia) {
        setLightboxMedia(null);
        setLightboxZoomed(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia]);

  async function handleDownloadMedia(url, caption) {
    if (!url) return;
    try {
      setDownloadingMedia(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cleanName = (caption || 'whatsapp_photo').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
      a.download = `${cleanName || 'whatsapp_photo'}_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    } finally {
      setDownloadingMedia(false);
    }
  }

  // Auto-Reply Bot configuration modal state
  const [showAutoReplyModal, setShowAutoReplyModal] = useState(false);
  const [autoReplySettings, setAutoReplySettings] = useState({
    enabled: true,
    mode: 'ONCE_PER_CONTACT',
    message: ''
  });
  const [loadingAutoReply, setLoadingAutoReply] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);
  const [autoReplySaveSuccess, setAutoReplySaveSuccess] = useState(false);

  useEffect(() => {
    loadInbox(false);
    loadAutoReplySettings();
    // Background auto-refresh polling every 8 seconds
    const interval = setInterval(() => {
      loadInbox(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [token]);

  async function loadAutoReplySettings() {
    try {
      setLoadingAutoReply(true);
      const res = await fetch('/api/replies/auto-reply-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAutoReplySettings(data.data);
      }
    } catch (err) {
      console.error('Failed to load auto-reply settings:', err);
    } finally {
      setLoadingAutoReply(false);
    }
  }

  async function handleSaveAutoReplySettings(e) {
    if (e) e.preventDefault();
    try {
      setSavingAutoReply(true);
      setAutoReplySaveSuccess(false);
      const res = await fetch('/api/replies/auto-reply-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(autoReplySettings)
      });
      const data = await res.json();
      if (data.success) {
        setAutoReplySettings(data.data);
        setAutoReplySaveSuccess(true);
        setTimeout(() => setAutoReplySaveSuccess(false), 2500);
      } else {
        alert(data.message || 'Failed to save auto-reply settings');
      }
    } catch (err) {
      alert(err.message || 'Error saving auto-reply settings');
    } finally {
      setSavingAutoReply(false);
    }
  }

  // Auto-scroll to bottom of chat when active conversation changes or new messages arrive
  useEffect(() => {
    if (selectedConvo?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConvo?.phone, selectedConvo?.messages?.length]);

  // Focus message input when switching conversations on desktop
  useEffect(() => {
    if (selectedConvo && typeof window !== 'undefined' && window.innerWidth >= 860) {
      textareaRef.current?.focus();
    }
  }, [selectedConvo?.phone]);

  async function loadInbox(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/inbox/replies?limit=1000', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const rawList = data.replies || data.data || [];

      if (data.success && Array.isArray(rawList)) {
        // Group by phone number
        const convos = {};

        rawList.forEach(r => {
          const phoneKey = r.from_phone;
          if (!phoneKey) return;

          const rawName = r.customer_name || r.contact_name;
          const guestName = (rawName && rawName !== 'Customer' && rawName !== 'Demo Customer') ? rawName : null;

          if (!convos[phoneKey]) {
            convos[phoneKey] = {
              phone: phoneKey,
              name: guestName || 'Guest',
              lastMessage: '',
              lastTime: r.received_at,
              unreadCount: 0,
              messages: []
            };
          } else if (guestName && convos[phoneKey].name === 'Guest') {
            convos[phoneKey].name = guestName;
          }

          if (r.is_read === 0) {
            convos[phoneKey].unreadCount += 1;
          }

          const isOutbound = r.message_type === 'outbound';
          const incomingText = r.message_body || r.message_text || '';

          // Determine if media exists or can be extracted from raw_payload or media_url
          let resolvedMediaUrl = r.media_url || null;
          let resolvedMediaType = r.media_type || null;
          let resolvedCaption = r.media_caption || null;
          let rawMediaId = null;

          if (!resolvedMediaUrl && r.raw_payload) {
            try {
              const raw = typeof r.raw_payload === 'string' ? JSON.parse(r.raw_payload) : r.raw_payload;
              const mediaObj = raw.image || raw.video || raw.document || raw.audio || raw.sticker;
              if (mediaObj?.id) {
                rawMediaId = mediaObj.id;
                resolvedMediaUrl = `/api/media/inbound/${mediaObj.id}`;
                resolvedMediaType = r.message_type || (raw.image ? 'image' : (raw.video ? 'video' : 'image'));
                resolvedCaption = resolvedCaption || mediaObj.caption || mediaObj.filename || null;
              }
            } catch (e) {}
          }

          if (isOutbound) {
            convos[phoneKey].messages.push({
              id: r.id || `out_${Math.random()}`,
              from_phone: 'Agent',
              text: incomingText || r.reply_text || '',
              media_url: resolvedMediaUrl,
              media_type: resolvedMediaType,
              media_caption: resolvedCaption,
              time: r.received_at,
              is_outbound: true,
              status: r.reply_status || 'SENT'
            });
          } else {
            const isMediaMsg = Boolean(resolvedMediaUrl || rawMediaId || r.message_type === 'image' || r.message_type === 'video');
            if (incomingText || isMediaMsg) {
              convos[phoneKey].messages.push({
                id: r.id,
                from_phone: r.from_phone,
                text: incomingText,
                media_url: resolvedMediaUrl,
                media_type: resolvedMediaType || (r.message_type === 'image' ? 'image' : null),
                media_caption: resolvedCaption,
                media_id: rawMediaId,
                time: r.received_at,
                is_outbound: false,
                is_read: r.is_read
              });
            }

            // If an auto-reply was sent to this message
            if (r.reply_text) {
              convos[phoneKey].messages.push({
                id: `${r.id}_reply`,
                from_phone: 'Agent',
                text: r.reply_text,
                media_url: null, // Critical: do NOT duplicate customer's incoming media onto agent text auto-reply
                media_type: null,
                media_caption: null,
                time: r.reply_sent_at || r.received_at,
                is_outbound: true,
                status: r.reply_status || 'SENT',
                is_auto: r.reply_status === 'AUTO_REPLIED'
              });
            }
          }
        });

        // Sort messages chronologically (oldest at top, newest at bottom)
        Object.values(convos).forEach(c => {
          c.messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          if (c.messages.length > 0) {
            const last = c.messages[c.messages.length - 1];
            const isLastVideo = last.media_type === 'video' || (last.media_url && /\.(mp4|3gp|mov|webm)(\?.*)?$/i.test(last.media_url));
            const isLastImage = last.media_type === 'image' || (last.media_url && !isLastVideo) || Boolean(last.media_id);
            const mediaTag = isLastVideo ? '🎬 Video' : (isLastImage ? '📷 Photo' : '');

            let previewText = last.text ? last.text.replace(/^\[(image|photo)\]\s*/i, '').trim() : '';
            if (/^\[(image|photo|image received|video|video received)\]$/i.test(previewText.trim())) {
              previewText = '';
            }
            if (!previewText && last.media_caption) {
              previewText = last.media_caption.trim();
            }
            const snippet = previewText ? (mediaTag ? `${mediaTag}: ${previewText}` : previewText) : (mediaTag || 'Message');

            c.lastMessage = last.is_outbound ? `You: ${snippet}` : snippet;
            c.lastTime = last.time;
          }
        });

        // Sort conversations by newest activity first
        const sortedConvos = Object.values(convos).sort(
          (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
        );

        setConversations(sortedConvos);

        // Keep current selection updated with new messages, or restore from sessionStorage, or auto-select on desktop
        setSelectedConvo(prev => {
          let targetPhone = prev?.phone;
          if (!targetPhone && typeof window !== 'undefined') {
            try {
              targetPhone = sessionStorage.getItem('inbox_selected_phone');
            } catch (e) {}
          }

          if (targetPhone) {
            const updated = sortedConvos.find(c => c.phone === targetPhone);
            if (updated) {
              return updated;
            }
          }

          // Initial load auto-select ONLY on desktop (window width >= 900px)
          if (!initialSelectionDone.current && typeof window !== 'undefined' && window.innerWidth >= 900 && sortedConvos.length > 0) {
            initialSelectionDone.current = true;
            try {
              sessionStorage.setItem('inbox_selected_phone', sortedConvos[0].phone);
            } catch (e) {}
            return sortedConvos[0];
          }

          return prev || null;
        });
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function handleSelectConversation(convo) {
    setSelectedConvo(convo);
    initialSelectionDone.current = true;
    try {
      sessionStorage.setItem('inbox_selected_phone', convo.phone);
    } catch (e) {}

    // Clear unread badge locally
    if (convo.unreadCount > 0) {
      setConversations(prev => 
        prev.map(c => c.phone === convo.phone ? { ...c, unreadCount: 0 } : c)
      );
      // Mark as read in backend
      const unreadIds = convo.messages
        .filter(m => !m.is_outbound && m.is_read === 0 && m.id && typeof m.id === 'number')
        .map(m => m.id);
      
      unreadIds.forEach(id => {
        fetch(`/api/replies/${id}/mark-read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      });
    }
  }

  function handleBackToList() {
    setSelectedConvo(null);
    initialSelectionDone.current = true; // prevents background polling from forcing chat re-open
    try {
      sessionStorage.removeItem('inbox_selected_phone');
    } catch (e) {}
  }

  async function handleDeleteConversation(convo) {
    if (!convo || !convo.phone) return;
    const displayName = convo.name || `+${convo.phone}`;
    const count = convo.messages?.length || 0;
    const confirmed = window.confirm(
      `Are you sure you want to delete the chat with ${displayName}?\n\nThis will permanently delete all ${count} message${count === 1 ? '' : 's'} in this conversation.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/inbox/conversation/${encodeURIComponent(convo.phone)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(prev => prev.filter(c => c.phone !== convo.phone));
        setSelectedConvo(prev => (prev?.phone === convo.phone ? null : prev));
        try {
          if (sessionStorage.getItem('inbox_selected_phone') === convo.phone) {
            sessionStorage.removeItem('inbox_selected_phone');
          }
        } catch (e) {}
      } else {
        alert(data.message || 'Failed to delete chat.');
      }
    } catch (err) {
      alert(err.message || 'Error deleting chat.');
    }
  }

  async function handleDeleteMessage(msgId) {
    if (!msgId || typeof msgId !== 'number') return;
    const confirmed = window.confirm('Delete this message from chat history?');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/replies/${msgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConvo(prev => {
          if (!prev) return null;
          const updatedMessages = prev.messages.filter(m => m.id !== msgId);
          return {
            ...prev,
            messages: updatedMessages,
            lastMessage: updatedMessages.length > 0 ? (updatedMessages[updatedMessages.length - 1].text || '[Media]') : 'No messages'
          };
        });
        setConversations(prev =>
          prev.map(c => {
            if (c.phone === selectedConvo?.phone) {
              const updatedMessages = c.messages.filter(m => m.id !== msgId);
              return {
                ...c,
                messages: updatedMessages,
                lastMessage: updatedMessages.length > 0 ? (updatedMessages[updatedMessages.length - 1].text || '[Media]') : 'No messages'
              };
            }
            return c;
          })
        );
      } else {
        alert(data.message || 'Failed to delete message.');
      }
    } catch (err) {
      alert(err.message || 'Error deleting message.');
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|3gp|mov|webm)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

    if (!isImage && !isVideo) {
      alert('Please select a valid image (JPG, PNG, WEBP) or video (MP4, 3GP, MOV).');
      return;
    }

    if (file.size > 28 * 1024 * 1024) {
      alert('Selected file is larger than 28MB. Please select a smaller media file.');
      return;
    }

    setSelectedMediaFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    setMediaPreviewUrl(URL.createObjectURL(file));

    // Focus textarea so the user can immediately add a caption
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }

  function handleClearMedia() {
    if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setSelectedMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSendReply(e) {
    if (e && e.preventDefault) e.preventDefault();
    const hasText = Boolean(replyText && replyText.trim());
    if (!hasText && !selectedMediaFile) return;
    if (!selectedConvo || sendingReply) return;

    const textToSend = replyText;
    const mediaFile = selectedMediaFile;
    const currentMediaType = mediaType;
    const currentPreviewUrl = mediaPreviewUrl;

    setSendingReply(true);

    try {
      let res;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('to', selectedConvo.phone);
        formData.append('message', textToSend);
        formData.append('file', mediaFile);

        res = await fetch('/api/inbox/reply', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
      } else {
        res = await fetch('/api/inbox/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            to: selectedConvo.phone,
            message: textToSend
          })
        });
      }

      const data = await res.json();
      if (data.success) {
        const newMsg = {
          id: data.messageId || `out_${Date.now()}`,
          from_phone: 'Agent',
          text: textToSend,
          media_url: data.mediaUrl || currentPreviewUrl,
          media_type: data.mediaType || currentMediaType,
          time: new Date().toISOString(),
          is_outbound: true,
          status: 'SENT'
        };

        const updatedMessages = [...selectedConvo.messages, newMsg];
        const mediaTag = newMsg.media_type ? (newMsg.media_type === 'video' ? '🎬 Video' : '📷 Image') : '';
        const updatedConvo = {
          ...selectedConvo,
          messages: updatedMessages,
          lastMessage: `You: ${textToSend ? textToSend : `[${mediaTag || 'Media'}]`}`,
          lastTime: newMsg.time
        };

        setSelectedConvo(updatedConvo);
        setConversations(prev =>
          prev.map(c => (c.phone === selectedConvo.phone ? updatedConvo : c))
        );
        setReplyText('');
        handleClearMedia();

        if (textareaRef.current) {
          textareaRef.current.style.height = '42px';
        }
      } else {
        alert(data.message || 'Failed to send reply');
      }
    } catch (err) {
      alert(err.message || 'Failed to dispatch reply');
    } finally {
      setSendingReply(false);
    }
  }

  const filteredConvos = conversations.filter(c => 
    (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.phone || '').includes(search) ||
    (c.lastMessage || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>2-Way Customer Inbox</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
              Live Sync
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '3px' }}>
            Live WhatsApp customer conversations captured via Meta webhook. Read incoming guest messages and reply instantly.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Auto-Reply Bot Settings Trigger Button */}
          <button
            type="button"
            onClick={() => {
              loadAutoReplySettings();
              setShowAutoReplyModal(true);
            }}
            className="btn btn-secondary"
            style={{
              gap: '8px',
              fontSize: '0.825rem',
              border: autoReplySettings.enabled ? '1px solid #86EFAC' : '1px solid #CBD5E1',
              background: autoReplySettings.enabled ? '#F0FDF4' : '#FFFFFF',
              color: autoReplySettings.enabled ? '#15803D' : '#475569',
              fontWeight: 600,
              boxShadow: 'var(--shadow-xs)'
            }}
            title="Configure Automated Message Settings"
          >
            <Sparkles size={14} color={autoReplySettings.enabled ? '#16A34A' : '#94A3B8'} />
            <span>Auto-Reply Bot</span>
            {autoReplySettings.enabled ? (
              <span style={{
                fontSize: '0.68rem',
                background: '#DCFCE7',
                color: '#15803D',
                padding: '1px 7px',
                borderRadius: '10px',
                border: '1px solid #BBF7D0',
                fontWeight: 700
              }}>
                {autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '24h Window' : 'Once Only'}
              </span>
            ) : (
              <span style={{
                fontSize: '0.68rem',
                background: '#F1F5F9',
                color: '#64748B',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: 600
              }}>
                Off
              </span>
            )}
          </button>

          <button 
            type="button"
            onClick={() => loadInbox(false)} 
            className="btn btn-secondary" 
            style={{ gap: '6px', fontSize: '0.825rem' }} 
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'pulse-glow' : ''} />
            <span>{loading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Main Inbox Two-Pane Container */}
      <div className={`inbox-layout-container ${selectedConvo ? 'has-convo-selected' : ''}`}>
        
        {/* Left Pane: Conversation List */}
        <div className="inbox-list-pane">
          {/* Search Bar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', background: '#FFFFFF' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search guest name, phone, message..."
                className="saas-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '34px', paddingRight: search ? '30px' : '14px', fontSize: '0.825rem' }}
              />
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex'
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConvos.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                <MessageSquare size={36} color="#CBD5E1" style={{ margin: '0 auto 12px auto' }} />
                <div style={{ fontWeight: 600, color: '#475569' }}>
                  {loading ? 'Loading conversations...' : 'No conversations found'}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', lineHeight: 1.4 }}>
                  {loading 
                    ? 'Syncing customer replies from WhatsApp...' 
                    : 'When guests reply to your WhatsApp broadcasts or send messages to your WABA number, they appear here automatically.'}
                </div>
              </div>
            ) : (
              filteredConvos.map(c => {
                const isSelected = selectedConvo?.phone === c.phone;
                const initials = (c.name || c.phone || 'G').substring(0, 2).toUpperCase();

                return (
                  <div
                    key={c.phone}
                    onClick={() => handleSelectConversation(c)}
                    style={{
                      padding: '13px 16px',
                      borderBottom: '1px solid #E2E8F0',
                      background: isSelected ? '#FFFFFF' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      borderLeft: isSelected ? '4px solid var(--brand-wa)' : '4px solid transparent',
                      boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: isSelected ? '#DCFCE7' : '#F1F5F9',
                      border: `1px solid ${isSelected ? '#BBF7D0' : '#E2E8F0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSelected ? '#15803D' : '#475569',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0
                    }}>
                      {initials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: isSelected ? '#0F172A' : '#334155', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8', flexShrink: 0, marginLeft: '6px' }}>
                          {c.lastTime ? formatIndianTime(c.lastTime) : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#64748B', marginBottom: '2px' }}>
                        +{c.phone}
                      </div>

                      <div style={{
                        fontSize: '0.78rem',
                        color: isSelected ? '#334155' : '#64748B',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {c.lastMessage || 'No messages'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0, gap: '6px' }}>
                      {c.unreadCount > 0 ? (
                        <span style={{
                          background: 'var(--brand-wa)',
                          color: '#FFFFFF',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '10px'
                        }}>
                          {c.unreadCount}
                        </span>
                      ) : <span />}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(c);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94A3B8',
                          padding: '3px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = '#DC2626';
                          e.currentTarget.style.background = '#FEE2E2';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = '#94A3B8';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title={`Delete chat with ${c.name || c.phone}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Conversation */}
        <div className="inbox-chat-pane">
          {selectedConvo ? (
            <>
              {/* Header with Back Button */}
              <div style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {/* Dedicated Back Button */}
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="inbox-back-btn"
                    title="Back to conversation list"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>

                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#DCFCE7',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#15803D',
                    fontWeight: 800,
                    fontSize: '0.875rem',
                    flexShrink: 0
                  }}>
                    {(selectedConvo.name || selectedConvo.phone || 'G').substring(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedConvo.name}
                    </h3>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      +{selectedConvo.phone}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', gap: '4px' }}>
                    <ShieldCheck size={12} /> WhatsApp Verified
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(selectedConvo)}
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#DC2626',
                      cursor: 'pointer',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#FEE2E2';
                      e.currentTarget.style.borderColor = '#F87171';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#FEF2F2';
                      e.currentTarget.style.borderColor = '#FECACA';
                    }}
                    title="Delete entire chat conversation"
                  >
                    <Trash2 size={13} />
                    <span>Delete Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToList}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Close conversation"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Chat Messages Canvas */}
              <div style={{
                flex: 1,
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: '#F8FAFC'
              }}>
                {selectedConvo.messages.map((m, idx) => {
                  const isOutbound = m.is_outbound;
                  const displayTime = m.time ? formatIndianTime(m.time) : '';
                  const isVideo = m.media_type === 'video' || (m.media_url && /\.(mp4|3gp|mov|webm)(\?.*)?$/i.test(m.media_url));
                  const isImage = m.media_type === 'image' || (m.media_url && !isVideo) || Boolean(m.media_id);
                  const msgText = m.text || m.message_body || m.message_text || '';

                  // Extract clean caption: strip generic placeholders
                  let cleanCaption = m.media_caption || '';
                  if (!cleanCaption && msgText) {
                    if (!/^\[(image|photo|image received|video|video received)\]$/i.test(msgText.trim())) {
                      cleanCaption = msgText.replace(/^\[(image|photo)\]\s*/i, '').trim();
                    }
                  }

                  const imageSrcToUse = m.media_url || (m.media_id ? `/api/media/inbound/${m.media_id}` : null);
                  const shouldShowTextBlock = !isImage && !isVideo && Boolean(msgText);
                  const hasCaption = Boolean(cleanCaption);

                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        maxWidth: isImage ? '340px' : '80%',
                        alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                        background: isOutbound ? '#DCFCE7' : '#FFFFFF',
                        color: '#0F172A',
                        border: `1px solid ${isOutbound ? '#BBF7D0' : '#E2E8F0'}`,
                        borderRadius: isOutbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding: isImage ? '6px 6px 6px 6px' : '10px 14px',
                        boxShadow: 'var(--shadow-xs)',
                        wordWrap: 'break-word',
                        wordBreak: 'break-word'
                      }}
                    >
                      {m.is_auto && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 700, color: '#16A34A', marginBottom: '6px', padding: isImage ? '4px 6px 0 6px' : '0' }}>
                          <Sparkles size={11} /> Auto-Reply Bot
                        </div>
                      )}

                      {/* Attached Media Display: Video */}
                      {isVideo && m.media_url && (
                        <div style={{ marginBottom: cleanCaption ? '8px' : '4px', borderRadius: '8px', overflow: 'hidden', background: '#000000' }}>
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={m.media_url}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '320px',
                              display: 'block',
                              borderRadius: '8px'
                            }}
                          />
                          {cleanCaption && (
                            <div style={{ padding: '6px 8px', color: '#FFFFFF', fontSize: '0.85rem' }}>
                              {cleanCaption}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attached Media Display: Image */}
                      {isImage && (imageSrcToUse || m.media_id) && (
                        <ChatImageBubble
                          src={imageSrcToUse}
                          alt={cleanCaption || "WhatsApp Photo"}
                          caption={cleanCaption}
                          time={displayTime}
                          isOutbound={isOutbound}
                          mediaId={m.media_id}
                          senderName={selectedConvo.name || selectedConvo.phone}
                          onOpenLightbox={setLightboxMedia}
                        />
                      )}

                      {/* Preserved Formatted Text with Linebreaks and Spaces */}
                      {shouldShowTextBlock && (
                        <div style={{ 
                          fontSize: '0.875rem', 
                          lineHeight: 1.5, 
                          whiteSpace: 'pre-wrap', 
                          wordBreak: 'break-word' 
                        }}>
                          {msgText}
                        </div>
                      )}

                      {/* Timestamp & Status: show if text message, or video, or image with caption */}
                      {(!isImage || hasCaption || isVideo) && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '6px',
                          fontSize: '0.675rem',
                          color: '#64748B',
                          marginTop: isImage ? '2px' : '4px',
                          padding: isImage ? '0 4px 2px 0' : '0'
                        }}>
                          <span>{displayTime}</span>
                          {isOutbound && <CheckCheck size={13} color="#2563EB" />}
                          {typeof m.id === 'number' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(m.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '2px',
                                borderRadius: '3px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                marginLeft: '2px',
                                transition: 'color 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                              title="Delete this message"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Media Attachment Preview Bar */}
              {selectedMediaFile && (
                <div style={{
                  padding: '10px 16px',
                  background: '#F1F5F9',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {mediaType === 'video' ? (
                      <div style={{
                        position: 'relative',
                        width: '52px',
                        height: '52px',
                        borderRadius: '8px',
                        background: '#0F172A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {mediaPreviewUrl ? (
                          <video src={mediaPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <FileVideo size={24} color="#94A3B8" />
                        )}
                        <div style={{
                          position: 'absolute',
                          background: 'rgba(0,0,0,0.6)',
                          borderRadius: '50%',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        flexShrink: 0
                      }}>
                        <img
                          src={mediaPreviewUrl}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="badge" style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          background: mediaType === 'video' ? '#EFF6FF' : '#F0FDF4',
                          color: mediaType === 'video' ? '#1D4ED8' : '#15803D',
                          border: `1px solid ${mediaType === 'video' ? '#BFDBFE' : '#BBF7D0'}`
                        }}>
                          {mediaType === 'video' ? 'Video Ready' : 'Image Ready'}
                        </span>
                        <span style={{ fontSize: '0.725rem', color: '#64748B' }}>
                          {(selectedMediaFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#334155',
                        marginTop: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {selectedMediaFile.name}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearMedia}
                    style={{
                      background: '#E2E8F0',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#475569',
                      flexShrink: 0
                    }}
                    title="Remove attachment"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Reply Input Form */}
              <form 
                onSubmit={handleSendReply}
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '10px',
                  background: '#FFFFFF',
                  alignItems: 'flex-end'
                }}
              >
                {/* Hidden File Picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/3gpp,video/quicktime,video/webm"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* Attach File Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: selectedMediaFile ? '#DCFCE7' : '#F1F5F9',
                    border: `1px solid ${selectedMediaFile ? '#86EFAC' : '#CBD5E1'}`,
                    color: selectedMediaFile ? '#15803D' : '#475569',
                    borderRadius: '8px',
                    width: '42px',
                    height: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  title="Attach Image or Video (JPG, PNG, MP4, 3GP, MOV)"
                >
                  <Paperclip size={18} />
                </button>

                {/* Multi-line Auto-Expanding Textarea with Shift+Enter Support */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={
                      selectedMediaFile 
                        ? `Add caption for this ${mediaType}... (Enter to send, Shift+Enter for newline)`
                        : `Type a reply to ${selectedConvo.name}... (Enter to send, Shift+Enter for newline)`
                    }
                    className="saas-input"
                    value={replyText}
                    onChange={e => {
                      setReplyText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 42), 140)}px`;
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(e);
                      }
                    }}
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      maxHeight: '140px',
                      resize: 'none',
                      fontSize: '0.875rem',
                      lineHeight: '1.45',
                      padding: '10px 12px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      display: 'block',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={sendingReply || (!replyText.trim() && !selectedMediaFile)}
                  className="btn btn-action-green"
                  style={{
                    gap: '6px',
                    padding: '10px 18px',
                    height: '42px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Send size={15} />
                  <span>{sendingReply ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              padding: '30px'
            }}>
              <MessageSquare size={44} color="#CBD5E1" style={{ marginBottom: '14px' }} />
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>Select a customer conversation</div>
              <div style={{ fontSize: '0.825rem', marginTop: '6px', maxWidth: '340px', textAlign: 'center', color: '#64748B', lineHeight: 1.5 }}>
                Choose a guest from the left panel to review message history and dispatch instant WhatsApp replies.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Image Lightbox Modal */}
      {lightboxMedia && (
        <div 
          className="lightbox-backdrop"
          onClick={() => {
            setLightboxMedia(null);
            setLightboxZoomed(false);
          }}
          style={{ padding: '16px' }}
        >
          {/* Lightbox Header Bar */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFFFFF',
              marginBottom: '10px',
              padding: '6px 14px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '8px',
              backdropFilter: 'blur(6px)'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={16} color="var(--brand-wa-light)" />
                <span>{lightboxMedia.sender}</span>
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '2px' }}>
                {lightboxMedia.time ? formatIndianTime(lightboxMedia.time) : ''}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Zoom In / Out Toggle */}
              <button
                type="button"
                onClick={() => setLightboxZoomed(prev => !prev)}
                className="btn"
                style={{
                  background: lightboxZoomed ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                title={lightboxZoomed ? "Zoom out to fit" : "Zoom in 100%"}
              >
                {lightboxZoomed ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
                <span>{lightboxZoomed ? "Fit" : "100%"}</span>
              </button>

              {/* Direct Blob Download */}
              <button
                type="button"
                onClick={() => handleDownloadMedia(lightboxMedia.url, lightboxMedia.caption)}
                disabled={downloadingMedia}
                className="btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                title="Download high-resolution image to device"
              >
                <Download size={14} />
                <span>{downloadingMedia ? 'Downloading...' : 'Download'}</span>
              </button>

              {/* Full Size in New Tab */}
              <a
                href={lightboxMedia.url}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  transition: 'background 0.15s ease'
                }}
                title="Open raw image in new tab"
              >
                <ExternalLink size={14} />
                <span>Full Size</span>
              </a>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setLightboxMedia(null);
                  setLightboxZoomed(false);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease'
                }}
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image Canvas */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: lightboxZoomed ? 'auto' : 'hidden',
              padding: '10px'
            }}
          >
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.caption || "WhatsApp Photo"}
              onClick={() => setLightboxZoomed(prev => !prev)}
              style={{
                maxWidth: lightboxZoomed ? 'none' : '92vw',
                maxHeight: lightboxZoomed ? 'none' : '76vh',
                objectFit: 'contain',
                borderRadius: '8px',
                cursor: lightboxZoomed ? 'zoom-out' : 'zoom-in',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
                transition: 'transform 0.15s ease'
              }}
              title="Click photo to toggle 100% zoom"
            />

            {lightboxMedia.caption && (
              <div style={{
                marginTop: '14px',
                color: '#FFFFFF',
                background: 'rgba(0, 0, 0, 0.65)',
                padding: '8px 18px',
                borderRadius: '8px',
                maxWidth: '750px',
                textAlign: 'center',
                fontSize: '0.9rem',
                lineHeight: 1.45,
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}>
                {lightboxMedia.caption}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Auto-Reply Bot Configuration Modal */}
      {showAutoReplyModal && (
        <div 
          onClick={() => setShowAutoReplyModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '20px'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#DCFCE7',
                  color: '#15803D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Automated Message Settings
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
                    Control automated greeting replies for incoming WhatsApp customer messages
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoReplyModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveAutoReplySettings} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* 1. Master Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                background: autoReplySettings.enabled ? '#F0FDF4' : '#F8FAFC',
                border: `1.5px solid ${autoReplySettings.enabled ? '#BBF7D0' : '#E2E8F0'}`
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Enable Auto-Reply Bot</span>
                    {autoReplySettings.enabled && (
                      <span style={{ fontSize: '0.7rem', color: '#15803D', background: '#DCFCE7', padding: '1px 8px', borderRadius: '10px', fontWeight: 700 }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                    Automatically reply to incoming customer messages via WhatsApp Cloud API
                  </div>
                </div>

                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoReplySettings.enabled}
                    onChange={e => setAutoReplySettings({ ...autoReplySettings, enabled: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: autoReplySettings.enabled ? '#16A34A' : '#CBD5E1',
                    transition: '0.2s',
                    borderRadius: '24px'
                  }}>
                    <span style={{
                      position: 'absolute',
                      height: '18px',
                      width: '18px',
                      left: autoReplySettings.enabled ? '23px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      transition: '0.2s',
                      borderRadius: '50%',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }} />
                  </span>
                </label>
              </div>

              {/* 2. Message Frequency Selection (Only Once vs 24 Hours) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Auto-Reply Frequency (Deduplication)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  {/* Option A: ONCE_PER_CONTACT (Recommended) */}
                  <div
                    onClick={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_CONTACT' })}
                    style={{
                      border: autoReplySettings.mode === 'ONCE_PER_CONTACT' ? '2px solid #16A34A' : '1px solid #E2E8F0',
                      background: autoReplySettings.mode === 'ONCE_PER_CONTACT' ? '#F0FDF4' : '#FFFFFF',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="autoReplyMode"
                          checked={autoReplySettings.mode === 'ONCE_PER_CONTACT'}
                          onChange={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_CONTACT' })}
                          style={{ accentColor: '#16A34A' }}
                        />
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>
                          Send Only Once Ever per Contact
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.675rem',
                        fontWeight: 700,
                        background: '#DCFCE7',
                        color: '#15803D',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid #BBF7D0'
                      }}>
                        RECOMMENDED
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0 0 0 24px', lineHeight: 1.4 }}>
                      Sends the automated message <strong>strictly once</strong> when a new contact reaches out for the first time. Will <strong>never repeat</strong> on subsequent messages from that customer.
                    </p>
                  </div>

                  {/* Option B: ONCE_PER_24_HOURS */}
                  <div
                    onClick={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_24_HOURS' })}
                    style={{
                      border: autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '2px solid #16A34A' : '1px solid #E2E8F0',
                      background: autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '#F0FDF4' : '#FFFFFF',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <input
                        type="radio"
                        name="autoReplyMode"
                        checked={autoReplySettings.mode === 'ONCE_PER_24_HOURS'}
                        onChange={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_24_HOURS' })}
                        style={{ accentColor: '#16A34A' }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>
                        At Most Once per 24 Hours
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0 0 0 24px', lineHeight: 1.4 }}>
                      Sends at most once every 24 hours. If the customer messages on a different day, they receive an updated greeting.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Message Template Textarea */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#334155' }}>
                    Auto-Reply Message Template
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = autoReplySettings.message || '';
                      setAutoReplySettings({
                        ...autoReplySettings,
                        message: cur + (cur.endsWith(' ') || cur === '' ? '{{name}} ' : ' {{name}} ')
                      });
                    }}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                    title="Insert dynamic customer name variable"
                  >
                    + Insert <code>{`{{name}}`}</code>
                  </button>
                </div>

                <textarea
                  rows={3}
                  className="saas-input"
                  value={autoReplySettings.message || ''}
                  onChange={e => setAutoReplySettings({ ...autoReplySettings, message: e.target.value })}
                  placeholder="Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message. Our team will get back to you shortly."
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', lineHeight: 1.45, padding: '10px 12px' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
                  <code>{`{{name}}`}</code> will be replaced with the customer's WhatsApp profile name (e.g. &ldquo;Shivam&rdquo;).
                </span>
              </div>

              {/* 4. Live WhatsApp Preview Bubble */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Customer WhatsApp Preview
                </label>
                <div style={{
                  background: '#ECE5DD',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'flex-start'
                }}>
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '0 10px 10px 10px',
                    padding: '10px 14px',
                    maxWidth: '85%',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 700, color: '#16A34A', marginBottom: '4px' }}>
                      <Sparkles size={11} /> Auto-Reply Bot
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#0F172A', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                      {(autoReplySettings.message || 'Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message. Our team will get back to you shortly.').replace(/\{\{name\}\}/gi, 'Shivam')}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.675rem', color: '#94A3B8', marginTop: '4px' }}>
                      10:30 AM
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Success Alert */}
              {autoReplySaveSuccess && (
                <div style={{
                  background: '#DCFCE7',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <CheckCircle2 size={16} />
                  <span>Auto-reply settings saved successfully! Automated messages will now be sent once only.</span>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowAutoReplyModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingAutoReply}
                  className="btn btn-action-green"
                  style={{ padding: '8px 18px', fontSize: '0.825rem', gap: '6px' }}
                >
                  <CheckCircle2 size={15} />
                  <span>{savingAutoReply ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
