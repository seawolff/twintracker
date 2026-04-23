import { ImageResponse } from 'next/og';
import { getPostBySlug } from '../content';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  const title = post?.title ?? 'TwinTracker Posts';
  const category = post?.category ?? 'TwinTracker';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#ffffff',
          color: '#000000',
          padding: '72px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at top left, rgba(0,0,0,0.08), transparent 32%), linear-gradient(135deg, #fff 0%, #f5f5f5 100%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 999,
                padding: '10px 18px',
                fontSize: 24,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
              }}
            >
              {category}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 72,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.05em',
                maxWidth: 920,
              }}
            >
              {title}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 28,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: '#000000',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                TT
              </div>
              <div style={{ display: 'flex', fontWeight: 600 }}>TwinTracker</div>
            </div>
            <div style={{ display: 'flex', color: '#555555' }}>twintracker.app/posts</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
