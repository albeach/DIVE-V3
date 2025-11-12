import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Image metadata
export const alt = 'DIVE V3 - Coalition ICAM Platform';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Generate dynamic Open Graph image
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Logo Circle */}
        <div
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '40px',
            boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.5)',
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: 'white',
              letterSpacing: '-0.05em',
            }}
          >
            D
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            background: 'linear-gradient(to bottom, white, #cbd5e1)',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '-0.02em',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          DIVE V3
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: '#94a3b8',
            fontWeight: 500,
            textAlign: 'center',
            maxWidth: '900px',
            lineHeight: 1.4,
          }}
        >
          Coalition Identity & Access Management
        </div>

        {/* Badge */}
        <div
          style={{
            marginTop: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 24px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '100px',
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: '#60a5fa',
              fontWeight: 600,
            }}
          >
            🛡️ USA/NATO Secure
          </div>
        </div>

        {/* Features Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            display: 'flex',
            gap: '40px',
            fontSize: 18,
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: 20 }}>🔐</div>
            <div>Federated Auth</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: 20 }}>⚡</div>
            <div>ABAC Policy</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: 20 }}>🌐</div>
            <div>11 IdPs</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}




