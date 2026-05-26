export default function BienLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { height: auto !important; overflow: auto !important; }
        body { background: #ece6da; }
      `}</style>
      {children}
    </>
  );
}
