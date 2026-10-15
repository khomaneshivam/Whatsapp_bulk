import React from 'react';
import { Smartphone, CheckCheck, MoreVertical, Phone, Video, ArrowLeft } from 'lucide-react';

export default function PhoneMockup({ template, sampleData, mediaUrl, customBodyText }) {
  // If custom text or template components exist, parse them
  let headerText = '';
  let headerType = 'NONE';
  let bodyText = customBodyText || '';
  let footerText = '';
  let buttons = [];

  if (template?.components) {
    for (const comp of template.components) {
      if (comp.type === 'HEADER') {
        headerType = comp.format || 'TEXT';
        headerText = comp.text || '';
      } else if (comp.type === 'BODY') {
        if (!customBodyText) bodyText = comp.text || '';
      } else if (comp.type === 'FOOTER') {
        footerText = comp.text || '';
      } else if (comp.type === 'BUTTONS') {
        buttons = comp.buttons || [];
      }
    }
  }

  if (!bodyText && template?.bodyText) bodyText = template.bodyText;
  if (!bodyText && template?.body_text) bodyText = template.body_text;
  if (buttons.length === 0 && template?.buttons) buttons = template.buttons;

  // Replace variable tags like {{1}}, {{2}} with sample data
  const renderResolvedText = (text) => {
    if (!text) return '';
    let resolved = text;
    if (sampleData) {
      Object.keys(sampleData).forEach(key => {
        const val = sampleData[key] || `[${key}]`;
        resolved = resolved.replaceAll(`{{${key}}}`, val);
      });
    }
    return resolved;
  };

  const finalBody = renderResolvedText(bodyText) || "Select a Meta template or type a message to see realistic WhatsApp preview...";

  return (
    <div className="smartphone-wrapper">
      <div className="smartphone-screen">
        {/* Notch */}
        <div className="smartphone-notch" />

        {/* WhatsApp App Header */}
        <div style={{
          background: '#1f2c34',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #2a3942',
          color: '#e9edef'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={16} color="#aebac1" />
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: '#00a884',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.8rem',
              color: '#fff'
            }}>
              KT
            </div>
            <div>
              <div style={{ fontSize: '0.825rem', fontWeight: 600, lineHeight: 1.2 }}>KonkanTrip</div>
              <div style={{ fontSize: '0.65rem', color: '#8696a0' }}>Official WhatsApp Business</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#aebac1' }}>
            <Video size={15} />
            <Phone size={15} />
            <MoreVertical size={15} />
          </div>
        </div>

        {/* Chat Canvas */}
        <div style={{
          flex: 1,
          padding: '14px 10px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          gap: '10px'
        }}>
          {/* Security Banner */}
          <div style={{
            background: 'rgba(254, 237, 175, 0.08)',
            border: '1px solid rgba(254, 237, 175, 0.15)',
            borderRadius: '6px',
            padding: '5px 8px',
            textAlign: 'center',
            fontSize: '0.65rem',
            color: '#ffd279',
            lineHeight: 1.3
          }}>
            🔒 Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen.
          </div>

          {/* Today Divider */}
          <div style={{ textAlign: 'center', margin: '4px 0' }}>
            <span style={{
              background: '#182229',
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '0.65rem',
              color: '#8696a0',
              fontWeight: 600,
              textTransform: 'uppercase'
            }}>
              Today
            </span>
          </div>

          {/* Message Bubble (Incoming to customer) */}
          <div className="wa-bubble-received">
            {/* Header Media */}
            {(headerType === 'IMAGE' || mediaUrl) && (
              <div style={{
                background: '#111b21',
                borderRadius: '6px',
                marginBottom: '8px',
                height: '110px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #222e35'
              }}>
                <img
                  src={mediaUrl || 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=400&q=80'}
                  alt="Header Media"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80';
                  }}
                />
              </div>
            )}

            {/* Header Text */}
            {headerType === 'TEXT' && headerText && (
              <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '6px', color: '#fff' }}>
                {renderResolvedText(headerText)}
              </div>
            )}

            {/* Body Text */}
            <div style={{ whiteSpace: 'pre-wrap', color: '#d1d7db', fontSize: '0.8rem' }}>
              {finalBody}
            </div>

            {/* Footer Text */}
            {footerText && (
              <div style={{ fontSize: '0.7rem', color: '#8696a0', marginTop: '6px', fontStyle: 'italic' }}>
                {renderResolvedText(footerText)}
              </div>
            )}

            {/* Timestamp & double ticks */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '4px',
              fontSize: '0.65rem',
              color: '#8696a0',
              marginTop: '4px'
            }}>
              <span>12:00 PM</span>
              <CheckCheck size={13} color="#53bdeb" />
            </div>

            {/* Quick Action Buttons */}
            {buttons && buttons.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                marginTop: '8px',
                paddingTop: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}>
                {buttons.map((btn, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      background: 'rgba(0, 168, 132, 0.1)',
                      border: '1px solid rgba(0, 168, 132, 0.3)',
                      color: '#00a884',
                      padding: '5px 8px',
                      borderRadius: '5px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {btn.text || btn.url || `Option ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mock Bottom Input Bar */}
        <div style={{
          background: '#202c33',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            flex: 1,
            background: '#2a3942',
            borderRadius: '16px',
            padding: '5px 12px',
            fontSize: '0.75rem',
            color: '#8696a0'
          }}>
            Type a message...
          </div>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: '#00a884',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Smartphone size={14} color="#fff" />
          </div>
        </div>
      </div>
    </div>
  );
}
