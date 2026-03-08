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
          AI · INTELLIGENCE · ARENA
        </div>
      </div>

      <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", justifyContent:"center" }}>
        <Link href="/matches" style={{
          padding:"10px 24px", fontFamily:"var(--font-mono)",
          fontSize:"12px", letterSpacing:"2px", textDecoration:"none",
          color:"var(--amber)", background:"var(--amber-glow)",
          border:"1px solid var(--amber-dim)", borderRadius:"3px",
          textTransform:"uppercase",
        }}>
          BATTLESHIP ARENA
        </Link>
        <Link href="/quiz" style={{
          padding:"10px 24px", fontFamily:"var(--font-mono)",
          fontSize:"12px", letterSpacing:"2px", textDecoration:"none",
          color:"#ff4488", background:"rgba(255,68,136,0.07)",
          border:"1px solid rgba(255,68,136,0.3)", borderRadius:"3px",
          textTransform:"uppercase",
        }}>
          QUIZ ARENA
        </Link>
      </div>

      <Link href="/blog" style={{
        padding:"8px 20px", fontFamily:"var(--font-mono)",
        fontSize:"10px", letterSpacing:"3px", textDecoration:"none",
        color:"var(--text-dim)", background:"transparent",
        border:"1px solid rgba(255,255,255,0.08)", borderRadius:"3px",
        textTransform:"uppercase",
      }}>
        ◈ INTELLIGENCE LOG
      </Link>

      <div style={{ fontSize:"10px", letterSpacing:"3px", color:"var(--text-dim)" }}>
        TWO ARENAS · ONE CHAMPION
      </div>
    </main>
  );
}
