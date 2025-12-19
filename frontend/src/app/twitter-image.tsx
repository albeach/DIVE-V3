import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'DIVE V3 - Coalition ICAM Platform';
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = 'image/png';

// Twitter card image (slightly different proportions)
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
          padding: '60px',
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            background: 'linear-gradient(to bottom, white, #cbd5e1)',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '-0.02em',
            marginBottom: '16px',
          }}
        >
          DIVE V3 Coalition ICAM
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            fontWeight: 500,
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.4,
          }}
        >
          Secure federated authentication & ABAC authorization for USA/NATO partners
        </div>

        {/* Badge */}
        <div
          style={{
            marginTop: '32px',
            display: 'flex',
            gap: '24px',
          }}
        >
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '2px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '100px',
              fontSize: 20,
              color: '#60a5fa',
              fontWeight: 600,
            }}
          >
            🔒 Zero Trust
          </div>
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '2px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '100px',
              fontSize: 20,
              color: '#4ade80',
              fontWeight: 600,
            }}
          >
            🌐 11 Identity Providers
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
