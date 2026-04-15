import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32, height: 32,
          background: 'linear-gradient(135deg, #1a2332 0%, #243044 100%)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 900,
          fontSize: 14,
          color: '#c9a84c',
          letterSpacing: '-0.5px',
        }}
      >
        EI
      </div>
    ),
    { ...size }
  )
}
