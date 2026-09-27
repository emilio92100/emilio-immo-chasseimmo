/* La version en ligne du CRM (voir next.config.ts et NouvelleVersion). Une
   ligne, jamais mise en cache : un onglet ouvert depuis hier la compare à la
   sienne. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ v: process.env.EMI_VERSION || '' }, { headers: { 'Cache-Control': 'no-store' } });
}
