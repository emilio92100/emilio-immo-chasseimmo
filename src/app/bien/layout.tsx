export default function BienLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { height: auto !important; overflow: auto !important; }
        body { background: #ece6da; }
        /* La barre de défilement, sur ordinateur : globals.css (celle du CRM)
           la réduit à 4 px gris clair, on ne la voyait pas. */
        @media (hover:hover) and (pointer:fine) {
          html::-webkit-scrollbar { width: 14px; }
          html::-webkit-scrollbar-track { background: #e2dccf; }
          html::-webkit-scrollbar-thumb { background: #9a9282; border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; min-height: 48px; }
          html::-webkit-scrollbar-thumb:hover { background-color: #6f6758; }
        }
        @supports (-moz-appearance:none) {
          @media (hover:hover) and (pointer:fine) { html { scrollbar-width: auto; scrollbar-color: #9a9282 #e2dccf; } }
        }
      `}</style>
      {children}
    </>
  );
}
