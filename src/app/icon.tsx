import { ImageResponse } from 'next/og'

/* L'icône de l'onglet du CRM (V3.29) : le « E » d'Emilio, blanc sur le bleu
   de l'agence. L'image est écrite ici, en clair, plutôt que lue sur le
   disque : ce fichier est rendu au moment de la construction, sans adresse
   de site pour aller la chercher. Les originaux sont dans public/logos/. */

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

const E = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAASFBMVEXT2OBdcIwYLGAAamoWMloaNl27w85GXHw7UnSeqroaNl17iqEbNV39/f0NKlMAAAAdOGAuR2ohO2Hn6u6stsSKmKybp7hzhJwXCAgPAAAAGHRSTlP//ygCzqD/////Vf/+//8A/f////////+VVDUnAAACwUlEQVR42qVXiZKDIAwN1oK2EDk8/v9PNxzuqsWKbKbTdkbfIxc5YAjS0OfZykJpn02AeAH/9RiGVyu1LiWgN9tXgEWCB51ejl45SItHJCB8KVzvKAID3MEjif/eMhBBI3UZ2oplBnCw/OrTEMFjeOoStGGjUyRAP8uqw3N4wPDSBXDRB3TPLLZC9Zgw+kUmtPrKcci4R6vJBBdwxXB91g7QXB5vxgAfDcGsxFmN+Pe0gSsP4BLgQKdqqVGOim/Ve8J3C9Cm420wGw2ocWdfCxfqQ7Q+Ho8s/N3Jd4KEf2PwpeHKsQP+gmA93xLcTsGR+gYBOTzYj+R7ubjkyHICFAHvLCXx2ym3SMwp+YUgBoC1HWkCi8W8lecJaEL2uoUcwZnEkysHp/e27VQUePsUPkuXPEEnGFviBegN4tdA5cNPwiMB8zG8SxCtkC4lgawikBYnT8BRVhKQhDgKXwPqCDDqQFWQmxofmIWTF2B+M8buakB3p+t9FvkqFov5PQI04R5NFuVVzc8SIPMRBIEFHQNOvc/lRQacEOhUxkYsa3dwUgZ5aZuGfBkEW00Qy6BAXUeAvSq5QacEvvB7A26MKvt3rUs1QFcR6Hh5bimw1yCWUZofdBWBTo3YmVoNEFIn0pUERiUXVmqQYqhuWbAhqIrBnmBtxrLWhJjG8y0fZjSY6gmm/xGsA91cTyD+6USp3VUYM9ybQXP1ojhVAVl3LMHtbtTtkhOy5YjmzBmOWUqj7nbYTnHoMm6kZieAfw5azWHch+QF+9lqR7d8wP24v184UlOwm6amPbzrXRj3jwSvj5UnTufA1tXKt2ZDkx7PNcq48hyWLmTRjIkZY40RbAbl5i7X4ePS9bH2oWQ9qD+B+Ved4+4Z177PxZFe79gyzfPUM+EnjGyX/10886svrnIyYWxX35PlW3spW77/tf7/ACEFwpGmXGfiAAAAAElFTkSuQmCC'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={E} width={64} height={64} alt="" />
      </div>
    ),
    { ...size }
  )
}
