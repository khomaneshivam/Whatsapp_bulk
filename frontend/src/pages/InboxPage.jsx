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
  Clock,
  Sparkles
} from 'lucide-react';

export default function InboxPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadInbox();
    // Live auto-refresh polling every 8 seconds
    const interval = setInterval(() => {
      loadInbox(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (selectedConvo?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConvo?.phone, selectedConvo?.messages?.length]);

  async function loadInbox(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/inbox/replies', {
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

          if (isOutbound) {
            convos[phoneKey].messages.push({
              id: r.id || `out_${Math.random()}`,
              from_phone: 'Agent',
              text: incomingText || r.reply_text || '',
              time: r.received_at,
              is_outbound: true,
              status: r.reply_status || 'SENT'
            });
          } else {
            if (incomingText) {
              convos[phoneKey].messages.push({
                id: r.id,
                from_phone: r.from_phone,
                text: incomingText,
                time: r.received_at,
                is_outbound: false,
                is_read: r.is_read
              });
            }

            if (r.reply_text) {
              convos[phoneKey].messages.push({
                id: `${r.id}_reply`,
                from_phone: 'Agent',
                text: r.reply_text,
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
            c.lastMessage = last.is_outbound ? `You: ${last.text}` : last.text;
            c.lastTime = last.time;
          }
        });

        // Sort conversations by newest activity first
        const sortedConvos = Object.values(convos).sort(
          (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
        );

        setConversations(sortedConvos);

        // Keep current selection updated or select first on initial load
        setSelectedConvo(prev => {
          if (!prev && sortedConvos.length > 0) return sortedConvos[0];
          if (prev) {
            const updated = sortedConvos.find(c => c.phone === prev.phone);
            return updated || prev;
          }
          return null;
        });
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleSendReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedConvo) return;

    const textToSend = replyText.trim();
    setSendingReply(true);

    try {
      const res = await fetch('/api/inbox/reply', {
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
      const data = await res.json();
      if (data.success) {
        const newMsg = {
          id: `out_${Date.now()}`,
          from_phone: 'Agent',
          text: textToSend,
          time: new Date().toISOString(),
          is_outbound: true,
          status: 'SENT'
        };

        const updatedMessages = [...selectedConvo.messages, newMsg];
        const updatedConvo = {
          ...selectedConvo,
          messages: updatedMessages,
          lastMessage: `You: ${textToSend}`,
          lastTime: newMsg.time
        };

        setSelectedConvo(updatedConvo);
        setConversations(prev =>
          prev.map(c => (c.phone === selectedConvo.phone ? updatedConvo : c))
        );
        setReplyText('');
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
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>2-Way Customer Inbox</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, background: '#DCFCE7', color: '#15803D', padding: '2px 10px', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
              Live Sync
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Live WhatsApp customer conversations captured via Meta webhook. Read incoming guest messages and reply instantly.
          </p>
        </div>

        <button onClick={() => loadInbox(false)} className="btn btn-secondary" style={{ gap: '6px' }} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'pulse-glow' : ''} />
          <span>{loading ? 'Syncing...' : 'Refresh Inbox'}</span>
        </button>
      </div>

      {/* Main Inbox Two-Pane Container */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
        gap: '20px',
        height: '720px',
        background: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Left Pane: Conversation List */}
        <div style={{
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          background: '#F8FAFC'
        }}>
          {/* Search Bar */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: '#FFFFFF' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search guest name, phone, message..."
                className="saas-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '34px', fontSize: '0.825rem' }}
              />
              <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
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
                    onClick={() => setSelectedConvo(c)}
                    style={{
                      padding: '14px 18px',
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
                          {c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748B', marginBottom: '2px' }}>
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

                    {c.unreadCount > 0 && (
                      <span style={{
                        background: 'var(--brand-wa)',
                        color: '#FFFFFF',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '10px',
                        flexShrink: 0
                      }}>
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Conversation */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF' }}>
          {selectedConvo ? (
            <>
              {/* Header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: '#DCFCE7',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#15803D',
                    fontWeight: 800,
                    fontSize: '0.9rem'
                  }}>
                    {(selectedConvo.name || selectedConvo.phone || 'G').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{selectedConvo.name}</span>
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      +{selectedConvo.phone}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-success" style={{ fontSize: '0.725rem', gap: '5px' }}>
                    <ShieldCheck size={13} /> WhatsApp Verified User
                  </span>
                </div>
              </div>

              {/* Chat Messages Canvas */}
              <div style={{
                flex: 1,
                padding: '24px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: '#F8FAFC'
              }}>
                {selectedConvo.messages.map((m, idx) => {
                  const isOutbound = m.is_outbound;
                  const displayTime = m.time ? new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        maxWidth: '75%',
                        alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                        background: isOutbound ? '#DCFCE7' : '#FFFFFF',
                        color: '#0F172A',
                        border: `1px solid ${isOutbound ? '#BBF7D0' : '#E2E8F0'}`,
                        borderRadius: isOutbound ? '12px 12px 0 12px' : '12px 12px 12px 0',
                        padding: '10px 14px',
                        boxShadow: 'var(--shadow-xs)',
                        wordWrap: 'break-word'
                      }}
                    >
                      {m.is_auto && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#16A34A', marginBottom: '4px' }}>
                          <Sparkles size={11} /> Auto-Reply Bot
                        </div>
                      )}

                      <div style={{ fontSize: '0.875rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {m.text || m.message_body || m.message_text || ''}
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '4px',
                        fontSize: '0.675rem',
                        color: '#64748B',
                        marginTop: '4px'
                      }}>
                        <span>{displayTime}</span>
                        {isOutbound && <CheckCheck size={13} color="#2563EB" />}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input Form */}
              <form 
                onSubmit={handleSendReply}
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '10px',
                  background: '#FFFFFF'
                }}
              >
                <input
                  type="text"
                  placeholder={`Reply directly to ${selectedConvo.name} on WhatsApp...`}
                  className="saas-input"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="btn btn-action-green"
                  style={{ gap: '6px' }}
                >
                  <Send size={15} />
                  <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
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
              color: '#94A3B8'
            }}>
              <MessageSquare size={44} color="#CBD5E1" style={{ marginBottom: '14px' }} />
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>Select a customer conversation</div>
              <div style={{ fontSize: '0.825rem', marginTop: '4px', maxWidth: '320px', textAlign: 'center' }}>
                Pick a chat from the left panel to review message history and dispatch instant WhatsApp replies.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
