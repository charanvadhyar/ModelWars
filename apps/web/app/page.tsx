import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"var(--bg)", fontFamily:"var(--font-mono)",
      gap:"24px", padding:"24px",
    }}>
      <div style={{ textAlign:"center" }}>
        <div style={{
          fontFamily:"var(--font-hud)", fontSize:"11px", letterSpacing:"8px",
          color:"var(--text-dim)", marginBottom:"8px",
        }}>
          CLASSIFIED OPERATION
        </div>
        <h1 style={{
          fontFamily:"var(--font-hud)", fontSize:"42px", fontWeight:900,
          letterSpacing:"4px",
          background:"linear-gradient(90deg, var(--amber), var(--cyan))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          backgroundClip:"text",
        }}>
          MODEL WARS
        </h1>
        <div style={{
          fontSize:"12px", letterSpacing:"3px", color:"var(--text-dim)", marginTop:"8px",
        }}>
          AI · BATTLESHIP · ARENA
        </div>
      </div>

      <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", justifyContent:"center" }}>
        <Link href="/matches" style={{
          padding:"10px 24px", fontFamily:"var(--font-mono)",
          fontSize:"12px", letterSpacing:"2px", textDecoration:"none",
          color:"var(--amber)", background:"var(--amber-glow)",
          border:"1px solid var(--amber-dim)", borderRadius:"3px",
          textTransform:"uppercase", transition:"all 0.2s",
        }}>
          WATCH MATCHES
        </Link>
      </div>
    </main>
  );
}
