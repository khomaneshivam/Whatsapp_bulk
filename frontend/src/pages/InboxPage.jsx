import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  CheckCheck,
  Search,
  ShieldCheck
} from 'lucide-react';

export default function InboxPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInbox();
  }, []);

  async function loadInbox() {
    setLoading(true);
    try {
      const res = await fetch('/api/inbox/replies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.replies) {
        // Group by phone number
        const convos = {};
        data.replies.forEach(r => {
          const phoneKey = r.from_phone;
          if (!convos[phoneKey]) {
            convos[phoneKey] = {
              phone: phoneKey,
              name: r.contact_name || 'Guest',
              lastMessage: r.message_text,
              lastTime: r.received_at,
              messages: []
            };
          }
          convos[phoneKey].messages.push(r);
        });
        const list = Object.values(convos);
        setConversations(list);
        if (list.length > 0 && !selectedConvo) {
          setSelectedConvo(list[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedConvo) return;

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
          message: replyText
        })
      });
      const data = await res.json();
      if (data.success) {
        selectedConvo.messages.push({
          from_phone: 'Agent',
          message_text: replyText,
          received_at: new Date().toISOString(),
          is_outbound: true
        });
        setReplyText('');
      } else {
        alert(data.message || 'Failed to send reply');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingReply(false);
    }
  }

  const filteredConvos = conversations.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.phone.includes(search)
  );

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            2-Way Customer Inbox
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Inbound WhatsApp replies and real-time customer conversation history captured via Meta webhooks.
          </p>
        </div>

        <button onClick={loadInbox} className="btn btn-secondary" style={{ gap: '6px' }}>
          <RefreshCw size={15} className={loading ? 'pulse-glow' : ''} />
          <span>Refresh Inbox</span>
        </button>
      </div>

      {/* Main Inbox Two-Pane Container */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
        gap: '20px',
        height: '700px',
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
                placeholder="Search by guest name or number..."
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
                <MessageSquare size={32} color="#CBD5E1" style={{ margin: '0 auto 10px auto' }} />
                <div style={{ fontWeight: 600, color: '#475569' }}>No conversations found</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Inbound customer replies via Meta webhook will display here automatically.
                </div>
              </div>
            ) : (
              filteredConvos.map(c => {
                const isSelected = selectedConvo?.phone === c.phone;
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
                      boxShadow: isSelected ? 'var(--shadow-xs)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: isSelected ? '#0F172A' : '#334155', fontSize: '0.875rem' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        {c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748B', marginBottom: '4px' }}>
                      {c.phone}
                    </div>

                    <div style={{
                      fontSize: '0.8rem',
                      color: isSelected ? '#334155' : '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {c.lastMessage}
                    </div>
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
                    fontSize: '0.85rem'
                  }}>
                    {selectedConvo.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>{selectedConvo.name}</h3>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      {selectedConvo.phone}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                    <ShieldCheck size={12} /> WhatsApp Verified User
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
                  return (
                    <div
                      key={idx}
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
                      <div style={{ fontSize: '0.875rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {m.message_text}
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
                        <span>{new Date(m.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isOutbound && <CheckCheck size={13} color="#2563EB" />}
                      </div>
                    </div>
                  );
                })}
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
                  placeholder="Type an official WhatsApp reply message..."
                  className="saas-input"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="btn btn-action-green"
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
              color: '#94A3B8'
            }}>
              <MessageSquare size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
              <div style={{ fontWeight: 600, color: '#475569' }}>Select a conversation</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>Choose a customer on the left to read and send replies.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
