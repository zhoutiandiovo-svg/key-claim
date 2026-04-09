import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDrawKey, useGetKeyStats, getGetKeyStatsQueryKey } from "@workspace/api-client-react";
import avatarImg from "@assets/EBFEEF7B8C1A01413C6FE4BBFDABBE5B_1775756303705.png";
import bgImg from "@assets/D1DAA79F19AE2773795E32CFF3E5E083_1775756348970.png";

const TIER_AMOUNTS: Record<number, string> = { 1: "$7.77", 2: "$3.33", 3: "$1.11" };
const TIER_NAMES: Record<number, string> = { 1: "一等奖", 2: "二等奖", 3: "三等奖" };

const TIER_STYLES: Record<number, { bg: string; text: string; badge: string; badgeText: string; emoji: string }> = {
  1: { bg: "linear-gradient(135deg,#fffbeb,#fef3c7)", text: "#92400e", badge: "linear-gradient(135deg,#f7d060,#f4a425)", badgeText: "#7a4800", emoji: "🥇" },
  2: { bg: "linear-gradient(135deg,#f9fafb,#f3f4f6)", text: "#374151", badge: "linear-gradient(135deg,#e8e8e8,#bdbdbd)", badgeText: "#444", emoji: "🥈" },
  3: { bg: "linear-gradient(135deg,#fdf4ee,#fde8d4)", text: "#78350f", badge: "linear-gradient(135deg,#d4a97a,#b87c4c)", badgeText: "#fff", emoji: "🥉" },
};

interface DrawResult {
  key: string;
  tier: number;
  tierName: string;
  remaining: number;
}

interface CardFaceInfo {
  tier: number;
  tierName: string;
  amount: string;
}

type Phase = "idle" | "loading" | "picking" | "flipping" | "done" | "noKeys";

const LS_KEY = "qjbd_claimed_key";

function loadSavedClaim(): DrawResult | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DrawResult;
  } catch { /* ignore */ }
  return null;
}

function buildCardFaces(pickedIndex: number, result: DrawResult): CardFaceInfo[] {
  const otherTiers = [1, 2, 3].filter((t) => t !== result.tier);
  if (Math.random() > 0.5) [otherTiers[0], otherTiers[1]] = [otherTiers[1], otherTiers[0]];
  const faces: CardFaceInfo[] = [];
  let otherIdx = 0;
  for (let i = 0; i < 3; i++) {
    if (i === pickedIndex) {
      faces.push({ tier: result.tier, tierName: result.tierName, amount: TIER_AMOUNTS[result.tier] });
    } else {
      const t = otherTiers[otherIdx++];
      faces.push({ tier: t, tierName: TIER_NAMES[t], amount: TIER_AMOUNTS[t] });
    }
  }
  return faces;
}

function KeyDots() {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <span className="key-dot" /><span className="key-dot" /><span className="key-dot" />
      <span className="key-dot" /><span className="key-dot" />
    </span>
  );
}

function CardFaceDown() {
  return (
    <div className="card-3d-face card-face-down">
      <div className="card-back-pattern" />
      <div className="card-back-border" />
      <span className="card-back-symbol">?</span>
    </div>
  );
}

function CardFaceUp({ info, isWinner }: { info: CardFaceInfo; isWinner: boolean }) {
  const s = TIER_STYLES[info.tier];
  return (
    <div
      className={`card-3d-face card-face-up${isWinner ? " winner-glow" : ""}`}
      style={{ background: s.bg }}
    >
      {isWinner && <div className="card-winner-dot" />}
      <div style={{ fontSize: 28, marginBottom: 4 }}>{s.emoji}</div>
      <div style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 7px", borderRadius: 99,
        fontSize: 10, fontWeight: 700,
        background: s.badge, color: s.badgeText,
        marginBottom: 5,
      }}>
        {info.tierName}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: s.text }}>{info.amount}</div>
    </div>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const savedClaim = useRef(loadSavedClaim()).current;

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [isAlreadyClaimed, setIsAlreadyClaimed] = useState(false);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [cardFaces, setCardFaces] = useState<CardFaceInfo[] | null>(null);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [revealedKey, setRevealedKey] = useState(false);
  const [revealedSavedKey, setRevealedSavedKey] = useState(false);
  const [copiedSaved, setCopiedSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { data: stats } = useGetKeyStats({
    query: { queryKey: getGetKeyStatsQueryKey(), refetchOnWindowFocus: false },
  });

  const drawMutation = useDrawKey({
    mutation: {
      onSuccess(data) {
        const drawn = data as DrawResult;
        setResult(drawn);
        setPhase("picking");
        try { localStorage.setItem(LS_KEY, JSON.stringify(drawn)); } catch { /* ignore */ }
        queryClient.invalidateQueries({ queryKey: getGetKeyStatsQueryKey() });
      },
      onError(err: unknown) {
        const apiErr = err as { status?: number; data?: { key?: string; tier?: number; tierName?: string } };
        if (apiErr?.status === 409 && apiErr.data?.key) {
          const prev: DrawResult = {
            key: apiErr.data.key!,
            tier: apiErr.data.tier ?? 0,
            tierName: apiErr.data.tierName ?? "",
            remaining: stats ? (stats.tier1 + stats.tier2 + stats.tier3) : 0,
          };
          setResult(prev);
          setIsAlreadyClaimed(true);
          setPhase("picking");
          try { localStorage.setItem(LS_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        } else {
          setPhase("noKeys");
        }
      },
    },
  });

  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout); };
  }, []);

  const handleDraw = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase("loading");
    setResult(null);
    setIsAlreadyClaimed(false);
    setPickedIndex(null);
    setCardFaces(null);
    setFlippedCards(new Set());
    setRevealedKey(false);
    drawMutation.mutate({});
  };

  const handlePickCard = (index: number) => {
    if (phase !== "picking" || !result) return;

    setPickedIndex(index);
    const faces = buildCardFaces(index, result);
    setCardFaces(faces);
    setPhase("flipping");

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const nonPicked = [0, 1, 2].filter((i) => i !== index);
    const flipOrder = [...nonPicked, index];

    flipOrder.forEach((cardIdx, orderIdx) => {
      const t = setTimeout(() => {
        setFlippedCards((prev) => new Set([...prev, cardIdx]));
      }, orderIdx * 480);
      timersRef.current.push(t);
    });

    const doneTimer = setTimeout(() => {
      setPhase("done");
    }, flipOrder.length * 480 + 700);
    timersRef.current.push(doneTimer);
  };

  const handleCopyKey = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopySaved = () => {
    if (!savedClaim) return;
    navigator.clipboard.writeText(savedClaim.key).then(() => {
      setCopiedSaved(true);
      setTimeout(() => setCopiedSaved(false), 2000);
    });
  };

  const handleCopyAddr = () => {
    navigator.clipboard.writeText("https://xiaojibaobao-s.replit.app/api").then(() => {
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    });
  };

  const totalKeys = (stats?.tier1 ?? 0) + (stats?.tier2 ?? 0) + (stats?.tier3 ?? 0);
  const showCards = phase === "picking" || phase === "flipping" || phase === "done";
  const showKeySection = phase === "done";

  return (
    <div className="page-root">
      <div className="bg-section">
        <img alt="" className="bg-cover-img" draggable={false} src={bgImg} />
      </div>

      <div className="scroll-container">
        <div className="avatar-wrap avatar-pop">
          <img alt="avatar" className="avatar-img" src={avatarImg} />
        </div>

        <div className="profile-sheet slide-up">
          <div className="px-5 pt-20 pb-6 fade-in">

            <div className="text-center mb-3">
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", letterSpacing: "-0.02em" }}>
                世界需要七休日
              </h1>
            </div>

            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="tag-dark">
                <svg fill="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                领取七休
              </span>
              <span className="tag-light">匹诺康尼正式版</span>
            </div>

            <p style={{ textAlign: "center", fontSize: 13, color: "#aaa", marginBottom: 20 }}>
              点击领取俸禄 ·
            </p>

            <div className="flex items-stretch justify-center gap-3 mb-5">
              <div className="stat-chip flex-1">
                <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{totalKeys}</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>剩余密钥</span>
              </div>
              <div className="stat-chip flex-1">
                <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>皇帝</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>目前身份</span>
              </div>
              <div className="stat-chip flex-1">
                <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>∞</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>使用次数</span>
              </div>
            </div>

            {/* ===== Card draw area ===== */}
            {showCards && (
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                {phase === "picking" && (
                  <p className="picking-hint">✨ 请选择一张卡片</p>
                )}
                {phase === "flipping" && (
                  <p className="flipping-hint">揭晓结果中...</p>
                )}
                {phase === "done" && result && (
                  <p className="result-tier-label" style={{
                    color: result.tier === 1 ? "#d97706" : result.tier === 2 ? "#6b7280" : "#92400e",
                  }}>
                    {TIER_STYLES[result.tier].emoji} 恭喜获得 {result.tierName}！
                  </p>
                )}

                <div className="cards-row">
                  {[0, 1, 2].map((i) => {
                    const isFlipped = flippedCards.has(i);
                    const face = cardFaces?.[i];
                    const isWinner = i === pickedIndex;
                    const isPickable = phase === "picking";

                    return (
                      <div
                        key={i}
                        className={`card-3d-outer${isPickable ? " pickable" : ""}`}
                        onClick={() => isPickable && handlePickCard(i)}
                      >
                        <div className={`card-3d-inner${isFlipped ? " flipped" : ""}`}>
                          <CardFaceDown />
                          {face && <CardFaceUp info={face} isWinner={isWinner} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ===== Initial draw button ===== */}
            {(phase === "idle" || phase === "noKeys") && (
              <div className="section-row mb-3 flex-col items-start gap-2">
                <button
                  className="btn-black"
                  style={{ width: "100%" }}
                  onClick={handleDraw}
                  disabled={totalKeys === 0}
                >
                  {totalKeys === 0 ? "密钥已全部领取" : "点击领取俸禄"}
                </button>
                {phase === "noKeys" && (
                  <div style={{ width: "100%", background: "#fff3f3", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#c0392b", border: "1px solid #f5c6c6" }}>
                    抱歉，所有密钥已被领取完毕！
                  </div>
                )}
                {/* Show saved key when all keys are gone */}
                {(totalKeys === 0 || phase === "noKeys") && savedClaim && (
                  <>
                    <div style={{ width: "100%", background: "linear-gradient(135deg,#fffbe6,#fff7d6)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#92670a", border: "1px solid #ffe58f", display: "flex", alignItems: "center", gap: 8 }}>
                      <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      您之前已领取过密钥，以下是您的密钥
                    </div>
                    <div className="field-box w-full">
                      {revealedSavedKey ? (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "2px 10px", borderRadius: 99,
                              fontSize: 11, fontWeight: 700,
                              background: TIER_STYLES[savedClaim.tier]?.badge ?? "#eee",
                              color: TIER_STYLES[savedClaim.tier]?.badgeText ?? "#333",
                            }}>
                              {savedClaim.tierName}
                            </span>
                          </div>
                          <span style={{ fontFamily: "Menlo, monospace", fontSize: 13, color: "#111", letterSpacing: "0.04em", wordBreak: "break-all" }}>
                            {savedClaim.key}
                          </span>
                        </div>
                      ) : (
                        <KeyDots />
                      )}
                    </div>
                    {!revealedSavedKey ? (
                      <button className="btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setRevealedSavedKey(true)}>
                        查看我的密钥
                      </button>
                    ) : (
                      <button className="btn-ghost" onClick={handleCopySaved} style={{ width: "100%", justifyContent: "center" }}>
                        <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {copiedSaved ? "已复制!" : "复制密钥"}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ===== Loading state ===== */}
            {phase === "loading" && (
              <div className="section-row mb-3 flex-col items-start gap-2">
                <button className="btn-black" style={{ width: "100%" }} disabled>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <svg className="spinning" style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    抽取中...
                  </span>
                </button>
              </div>
            )}

            {/* ===== API Key section (shown after done or alreadyClaimed) ===== */}
            {showKeySection && result && (
              <div className="section-row mb-3 flex-col items-start gap-2">
                <div className="flex items-center justify-between w-full">
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    API 密钥
                  </span>
                </div>

                <div className="field-box w-full">
                  {revealedKey ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          padding: "2px 10px", borderRadius: 99,
                          fontSize: 11, fontWeight: 700,
                          background: TIER_STYLES[result.tier].badge,
                          color: TIER_STYLES[result.tier].badgeText,
                        }}>
                          {result.tierName}
                        </span>
                      </div>
                      <span style={{ fontFamily: "Menlo, monospace", fontSize: 13, color: "#111", letterSpacing: "0.04em", wordBreak: "break-all" }}>
                        {result.key}
                      </span>
                    </div>
                  ) : (
                    <KeyDots />
                  )}
                </div>

                {!revealedKey && (
                  <button className="btn-black" style={{ width: "100%" }} onClick={() => setRevealedKey(true)}>
                    查看我的密钥
                  </button>
                )}

                {revealedKey && (
                  <button className="btn-ghost" onClick={handleCopyKey} style={{ width: "100%", justifyContent: "center" }}>
                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copied ? "已复制!" : "复制密钥"}
                  </button>
                )}

                {isAlreadyClaimed && (
                  <div style={{ width: "100%", background: "linear-gradient(135deg,#fffbe6,#fff7d6)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#92670a", border: "1px solid #ffe58f", display: "flex", alignItems: "center", gap: 8 }}>
                    <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    每个用户仅限领取一次，以下是您之前领取的密钥
                  </div>
                )}
              </div>
            )}

            {/* ===== API Address section ===== */}
            <div className="section-row flex-col items-start gap-2 mb-4">
              <span style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                API 地址
              </span>
              <div className="field-box w-full" style={{ fontSize: 13 }}>
                https://xiaojibaobao-s.replit.app/api
              </div>
              <button className="btn-ghost" onClick={handleCopyAddr} style={{ justifyContent: "center" }}>
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                {copiedAddr ? "已复制!" : "复制 API 地址"}
              </button>
            </div>

            <div className="section-row">
              <div style={{ width: 32, height: 32, borderRadius: 12, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg style={{ width: 16, height: 16, color: "#555" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>密钥信息</p>
                <p style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>请妥善保管，勿泄露给他人</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
