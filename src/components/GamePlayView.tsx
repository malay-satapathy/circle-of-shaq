import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Eye,
  EyeOff,
  Siren,
  ShieldAlert,
  HelpCircle,
  RotateCcw,
  Trophy,
  LogOut,
  Users,
  Layers,
  Volume2,
  Trash2,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS, getDeckById } from '../data/decks';

type SuspectTag = 'UNKNOWN' | 'SHAQ' | 'PAKKA';

/**
 * Synthesizes an unmistakable dual-tone emergency Shaq Siren using the browser's native Web Audio API
 * (Zero external MP3 files needed — works on every mobile phone and laptop!)
 */
function playShaqSirenAudio() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const now = ctx.currentTime;

    // Classic rising-and-falling police/emergency siren sweep
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(960, now + 0.35);
    osc.frequency.linearRampToValueAtTime(520, now + 0.7);
    osc.frequency.linearRampToValueAtTime(960, now + 1.05);
    osc.frequency.linearRampToValueAtTime(520, now + 1.4);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
    gain.gain.setValueAtTime(0.18, now + 1.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.45);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Ignore if browser audio policy blocks autoplay
  }
}

export const GamePlayView: React.FC = () => {
  const {
    roomState,
    myRole,
    myPlayerId,
    isHost,
    leaveRoom,
    callVote,
    cancelVote,
    castVote,
    forceEndVoting,
    blowCoverAsSpy,
    submitSpyGuess,
    startRound,
    showWinnersPodium,
    returnToLobbyKeepScores,
    removePlayer,
    getPassAndPlayRole,
    errorBanner,
    clearError,
  } = useGame();

  // Local interactive states (automatically reset on every new roundNumber!)
  const [isCardHidden, setIsCardHidden] = useState(false);
  const [suspectTags, setSuspectTags] = useState<Record<string, SuspectTag>>({});
  const [crossedLocations, setCrossedLocations] = useState<Record<string, boolean>>({});
  const [questionHint, setQuestionHint] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'SUSPECTS' | 'LOCATIONS'>('SUSPECTS');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(480);
  const [phaseCountdown, setPhaseCountdown] = useState<number>(45);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);

  // Pass-and-Play sequential card reveal state
  const [pnpRevealIndex, setPnpRevealIndex] = useState<number>(0);
  const [pnpCardOpened, setPnpCardOpened] = useState<boolean>(false);
  const [pnpAllRevealed, setPnpAllRevealed] = useState<boolean>(false);
  const [pnpActiveVoterIdx, setPnpActiveVoterIdx] = useState<number>(0);
  const [pnpMidRoundSpyModal, setPnpMidRoundSpyModal] = useState<boolean>(false);

  const prevStatusRef = useRef<string | null>(null);
  const roundNumber = roomState?.roundNumber || 1;
  const status = roomState?.status;
  const roundEndsAt = roomState?.roundEndsAt;
  const pausedRemainingMs = roomState?.pausedRemainingMs;
  const votingEndsAt = roomState?.votingEndsAt;
  const spyGuessEndsAt = roomState?.spyGuessEndsAt;

  // Reset local markings cleanly whenever a new round starts!
  useEffect(() => {
    setSuspectTags({});
    setCrossedLocations({});
    setQuestionHint('');
    setSelectedVoteTarget(null);
    setIsCardHidden(false);
    setPnpRevealIndex(0);
    setPnpCardOpened(false);
    setPnpAllRevealed(roomState?.mode !== 'PASS_AND_PLAY');
    setPnpActiveVoterIdx(0);
    setPnpMidRoundSpyModal(false);
  }, [roundNumber, roomState?.mode]);

  // Play the Shaq Siren sound automatically across ALL connected devices whenever VOTING begins!
  useEffect(() => {
    if (status === 'VOTING' && prevStatusRef.current !== 'VOTING') {
      playShaqSirenAudio();
    }
    prevStatusRef.current = status || null;
  }, [status]);

  // Smooth, flicker-free countdown timer (depends only on primitive timestamps, not roomState object reference)
  useEffect(() => {
    if (!status) return;
    const tick = () => {
      const now = Date.now();
      if (status === 'PLAYING' && roundEndsAt) {
        const nextSecs = Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
        setRemainingSeconds((prev) => (prev === nextSecs ? prev : nextSecs));
      } else if (pausedRemainingMs !== null && pausedRemainingMs !== undefined) {
        const nextSecs = Math.max(0, Math.ceil(pausedRemainingMs / 1000));
        setRemainingSeconds((prev) => (prev === nextSecs ? prev : nextSecs));
      }

      if (status === 'VOTING' && votingEndsAt) {
        const nextPhase = Math.max(0, Math.ceil((votingEndsAt - now) / 1000));
        setPhaseCountdown((prev) => (prev === nextPhase ? prev : nextPhase));
      } else if (status === 'SPY_GUESS' && spyGuessEndsAt) {
        const nextPhase = Math.max(0, Math.ceil((spyGuessEndsAt - now) / 1000));
        setPhaseCountdown((prev) => (prev === nextPhase ? prev : nextPhase));
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [status, roundEndsAt, pausedRemainingMs, votingEndsAt, spyGuessEndsAt]);

  if (!roomState) return null;

  const {
    roomId,
    mode,
    settings,
    players,
    chosenCards,
    lastRoundSummary,
    liveVoteCounts,
    totalVotesCast,
    spyGuessingPlayerName,
  } = roomState;

  const deck = getDeckById(settings.deckId);
  const activePlayers = players.filter((p) => !p.isSpectator);
  const progressPct = Math.min(
    100,
    Math.max(0, (remainingSeconds / settings.timerDurationSeconds) * 100)
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const cycleSuspectTag = (pid: string) => {
    setSuspectTags((prev) => {
      const cur = prev[pid] || 'UNKNOWN';
      const next: SuspectTag =
        cur === 'UNKNOWN' ? 'SHAQ' : cur === 'SHAQ' ? 'PAKKA' : 'UNKNOWN';
      return { ...prev, [pid]: next };
    });
  };

  const toggleLocationCard = (cardName: string) => {
    setCrossedLocations((prev) => ({ ...prev, [cardName]: !prev[cardName] }));
  };

  const generateRandomQuestion = () => {
    const pool = deck.sampleQuestions;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setQuestionHint(pick);
  };

  const handleRingShaqSiren = () => {
    playShaqSirenAudio();
    callVote(myPlayerId || undefined);
  };

  // PASS-AND-PLAY ROLE DEALING OVERLAY
  if (mode === 'PASS_AND_PLAY' && !pnpAllRevealed && status === 'PLAYING') {
    const currentPnpPlayer = activePlayers[pnpRevealIndex];
    const currentPnpRole = currentPnpPlayer
      ? getPassAndPlayRole(currentPnpPlayer.id)
      : null;
    const av = currentPnpPlayer
      ? AVATARS[currentPnpPlayer.avatarId % AVATARS.length]
      : AVATARS[0];

    return (
      <div className="min-h-screen bg-[#07080d] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-[#10121d] border border-white/15 text-center space-y-6 shadow-2xl">
          <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
            Pass-and-Play Deal ({pnpRevealIndex + 1} of {activePlayers.length})
          </div>

          <div className="flex flex-col items-center">
            <div
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-3xl shadow-lg mb-3`}
            >
              {av.emoji}
            </div>
            <h2 className="text-2xl font-black text-white">
              Pass Phone to <span className="text-rose-400">{currentPnpPlayer?.name}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Keep the screen private before tapping!
            </p>
          </div>

          {!pnpCardOpened ? (
            <button
              onClick={() => setPnpCardOpened(true)}
              className="w-full py-12 rounded-2xl bg-gradient-to-br from-rose-950/60 to-amber-950/40 border-2 border-dashed border-rose-500/50 hover:border-amber-400 flex flex-col items-center justify-center gap-3 transition-all"
            >
              <Eye className="w-8 h-8 text-amber-400" />
              <span className="font-bold text-base text-white">
                Tap to See {currentPnpPlayer?.name}'s Secret Role
              </span>
            </button>
          ) : (
            <div
              className={`p-6 rounded-2xl border-2 space-y-3 ${
                currentPnpRole?.isSpy
                  ? 'bg-gradient-to-br from-rose-950/90 to-red-900/60 border-rose-500'
                  : 'bg-gradient-to-br from-emerald-950/90 to-teal-900/50 border-emerald-500'
              }`}
            >
              {currentPnpRole?.isSpy ? (
                <>
                  <div className="text-4xl">🕵️‍♂️</div>
                  <div className="text-xs font-mono uppercase tracking-widest text-rose-300">
                    IT'S DHOKHA TIME!
                  </div>
                  <div className="text-2xl font-black text-white">
                    YOU ARE THE {deck.spyTitle.toUpperCase()}!
                  </div>
                  <p className="text-xs text-rose-200 leading-relaxed">
                    Blend in and figure out the secret {deck.cardNoun.toLowerCase()}.
                  </p>
                  {currentPnpRole.fellowSpies.length > 0 && (
                    <div className="p-2 rounded-xl bg-black/40 text-xs text-amber-300 font-semibold">
                      Co-Spy: {currentPnpRole.fellowSpies.map((s) => s.name).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-4xl">{currentPnpRole?.locationEmoji || '📍'}</div>
                  <div className="text-xs font-mono uppercase tracking-widest text-emerald-300">
                    Secret {deck.cardNoun}
                  </div>
                  <div className="text-2xl font-black text-white">
                    {currentPnpRole?.location}
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full bg-black/40 text-amber-300 text-xs font-bold">
                    Role: {currentPnpRole?.role}
                  </div>
                </>
              )}
            </div>
          )}

          {pnpCardOpened && (
            <button
              onClick={() => {
                setPnpCardOpened(false);
                if (pnpRevealIndex + 1 < activePlayers.length) {
                  setPnpRevealIndex((i) => i + 1);
                } else {
                  setPnpAllRevealed(true);
                }
              }}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 font-bold text-white shadow-lg"
            >
              {pnpRevealIndex + 1 < activePlayers.length
                ? 'Hide & Pass to Next Player →'
                : 'Start Round! 🚀'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col">
      {/* Clean, Simple Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/95 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
          {/* Brand + Room Code */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-tight">
                  CIRCLE OF SHAQ
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300">
                  #{roomId}
                </span>
              </div>
            </div>
          </div>

          {/* Countdown Timer + Leave */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3.5 py-1.5 rounded-xl font-mono font-black text-base sm:text-lg border flex items-center gap-1.5 ${
                remainingSeconds <= 60
                  ? 'bg-rose-950/90 border-rose-500 text-rose-400'
                  : 'bg-white/5 border-white/15 text-amber-300'
              }`}
            >
              <span>⏱️ {formatTime(remainingSeconds)}</span>
            </div>

            <button
              onClick={leaveRoom}
              className="p-2 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white"
              title="Leave Game"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-white/5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              remainingSeconds <= 60
                ? 'bg-gradient-to-r from-rose-600 to-red-400'
                : 'bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {errorBanner && (
        <div className="max-w-5xl mx-auto mt-3 px-4 w-full">
          <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between">
            <span>⚠️ {errorBanner}</span>
            <button onClick={clearError} className="text-rose-400 font-bold">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* SIMPLE, CLEAN WORKSPACE */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* TOP SECTION: Secret Role Card + Prominent Shaq Siren Action Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
          {/* 1. Secret Identity Card (7 cols) */}
          <div className="md:col-span-7 p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                1. Your Secret Identity (Round #{roundNumber})
              </span>
              <button
                onClick={() => setIsCardHidden((h) => !h)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-amber-300 flex items-center gap-1"
              >
                {isCardHidden ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Tap to Hide</span>
                  </>
                )}
              </button>
            </div>

            {mode === 'PASS_AND_PLAY' ? (
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-center space-y-2">
                <div className="font-bold text-sm text-white">🔒 Pass-and-Play Mode</div>
                <button
                  onClick={() => {
                    setPnpRevealIndex(0);
                    setPnpCardOpened(false);
                    setPnpAllRevealed(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-amber-300 font-semibold"
                >
                  Re-check Roles Privately
                </button>
              </div>
            ) : isCardHidden || !myRole ? (
              <div
                onClick={() => setIsCardHidden(false)}
                className="cursor-pointer py-8 px-4 rounded-2xl bg-black/40 border-2 border-dashed border-white/15 hover:border-amber-400/50 text-center space-y-1.5 transition-all"
              >
                <Eye className="w-7 h-7 text-amber-400 mx-auto" />
                <div className="font-bold text-sm text-white">Role Hidden from Peekers</div>
                <div className="text-xs text-slate-400">Tap here to view your role</div>
              </div>
            ) : (
              /* Neutral dark container for both Spy and Innocent so no screen glow gives away the Spy */
              <div
                onClick={() => setIsCardHidden(true)}
                className="cursor-pointer p-4 rounded-2xl bg-gradient-to-br from-[#16192b] to-[#0c0e18] border border-white/15 hover:border-white/30 flex items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl shrink-0">
                    {myRole.isSpy ? '🕵️‍♂️' : myRole.locationEmoji || '📍'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
                      {myRole.isSpy ? 'Undercover Impostor' : `Secret ${deck.cardNoun}`}
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-white truncate">
                      {myRole.isSpy ? `YOU ARE THE ${deck.spyTitle.toUpperCase()}` : myRole.location}
                    </div>
                    <div className="text-xs text-slate-300 font-medium mt-0.5">
                      {myRole.isSpy
                        ? `Figure out the ${deck.cardNoun.toLowerCase()} without getting caught!`
                        : `Your Role: ${myRole.role}`}
                    </div>
                    {myRole.isSpy && myRole.fellowSpies.length > 0 && (
                      <div className="text-xs text-amber-300 font-mono mt-0.5">
                        Co-Spy: {myRole.fellowSpies.map((s) => s.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Prominent Action Center: SHAQ SIREN (Vote) + Question Idea (5 cols) */}
          <div className="md:col-span-5 p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10 shadow-xl flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                2. Ready to Accuse?
              </div>

              {/* BIG, UNMISTAKABLE SHAQ SIREN BUTTON */}
              <button
                type="button"
                onClick={handleRingShaqSiren}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 active:scale-[0.99] text-white font-black text-base shadow-xl shadow-rose-600/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              >
                <Siren className="w-6 h-6 animate-bounce" />
                <span>🚨 RING SHAQ SIREN (VOTE)</span>
                <Volume2 className="w-4 h-4 opacity-80" />
              </button>

              {/* Spy Only: Guess Location Mid-Round */}
              {(myRole?.isSpy || mode === 'PASS_AND_PLAY') && (
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'PASS_AND_PLAY') {
                      setPnpMidRoundSpyModal(true);
                    } else {
                      blowCoverAsSpy(myPlayerId || undefined);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Know the {deck.cardNoun}? Blow Cover & Guess (+2 pts)</span>
                </button>
              )}
            </div>

            {/* Simple 1-Tap Question Starter */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={generateRandomQuestion}
                className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Need a Question to Ask? Tap Here</span>
              </button>
              {questionHint && (
                <div className="mt-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-100 italic text-center">
                  "{questionHint}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden p-1 rounded-2xl bg-[#10121d] border border-white/10">
          <button
            onClick={() => setMobileTab('SUSPECTS')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
              mobileTab === 'SUSPECTS'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Players ({activePlayers.length})</span>
          </button>
          <button
            onClick={() => setMobileTab('LOCATIONS')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
              mobileTab === 'LOCATIONS'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{deck.cardNoun}s ({chosenCards.length})</span>
          </button>
        </div>

        {/* BOTTOM SECTION: Clean Players Grid + Locations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* PLAYERS LIST: Tap to mark SHAQ (Suspect) or PAKKA (Safe) (5 cols) */}
          <div
            className={`${
              mobileTab === 'LOCATIONS' ? 'hidden md:block' : 'block'
            } md:col-span-5 p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10`}
          >
            <div className="mb-3">
              <h2 className="text-base font-black text-white">
                Players ({activePlayers.length})
              </h2>
              <p className="text-xs text-slate-400">
                Tap any player to mark them <span className="text-rose-400 font-semibold">🚨 Shaq</span> or <span className="text-emerald-400 font-semibold">✓ Safe</span> on your screen.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {activePlayers.map((p) => {
                const av = AVATARS[p.avatarId % AVATARS.length];
                const tag = suspectTags[p.id] || 'UNKNOWN';

                return (
                  <div
                    key={p.id}
                    className={`w-full p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                      tag === 'SHAQ'
                        ? 'bg-rose-950/40 border-rose-500/60'
                        : tag === 'PAKKA'
                        ? 'bg-emerald-950/35 border-emerald-500/50'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => cycleSuspectTag(p.id)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-base shrink-0`}
                      >
                        {av.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">
                          {p.name}{' '}
                          {p.id === myPlayerId && (
                            <span className="text-[10px] text-rose-400 font-mono">(You)</span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-amber-300">
                          {p.score} pts
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => cycleSuspectTag(p.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase ${
                          tag === 'SHAQ'
                            ? 'bg-rose-500 text-white'
                            : tag === 'PAKKA'
                            ? 'bg-emerald-500 text-black'
                            : 'bg-white/10 text-slate-400'
                        }`}
                      >
                        {tag === 'SHAQ' ? '🚨 SHAQ' : tag === 'PAKKA' ? '✓ SAFE' : 'Tap to Tag'}
                      </button>

                      {isHost && !p.isHost && p.id !== myPlayerId && (
                        <button
                          type="button"
                          onClick={() => removePlayer(p.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title={`Remove ${p.name} from Circle`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* POSSIBLE LOCATIONS CHECKLIST (7 cols) */}
          <div
            className={`${
              mobileTab === 'SUSPECTS' ? 'hidden md:block' : 'block'
            } md:col-span-7 p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-black text-white">
                  Possible {deck.cardNoun}s ({chosenCards.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Tap any {deck.cardNoun.toLowerCase()} to cross it out as you narrow down clues.
                </p>
              </div>
              {Object.values(crossedLocations).some(Boolean) && (
                <button
                  onClick={() => setCrossedLocations({})}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {chosenCards.map((card) => {
                const isCrossed = Boolean(crossedLocations[card.name]);
                const isMyLocation =
                  !myRole?.isSpy &&
                  myRole?.location === card.name &&
                  !isCardHidden &&
                  mode !== 'PASS_AND_PLAY';
                return (
                  <button
                    key={card.name}
                    type="button"
                    onClick={() => toggleLocationCard(card.name)}
                    className={`p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2 ${
                      isCrossed
                        ? 'bg-black/40 border-white/5 opacity-35 line-through text-slate-500'
                        : isMyLocation
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                        : 'bg-white/[0.03] border-white/10 hover:border-amber-400/50 text-white'
                    }`}
                  >
                    <span className="text-xl shrink-0">{card.emoji}</span>
                    <span className="font-bold text-xs sm:text-sm truncate">{card.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* =====================================================================
          MODAL 1: SHAQ SIREN VOTING OVERLAY
         ===================================================================== */}
      {status === 'VOTING' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-xl w-full p-6 sm:p-7 rounded-3xl bg-[#111422] border-2 border-amber-500/60 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono uppercase tracking-widest">
                  <Siren className="w-4 h-4 animate-bounce" />
                  <span>🚨 Shaq Siren Triggered by {roomState.votingCallerName}</span>
                </div>
                <h2 className="text-2xl font-black text-white mt-1">
                  Vote: Who is the {deck.spyTitle}?
                </h2>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/40 font-mono font-black text-lg text-amber-300">
                {phaseCountdown}s
              </div>
            </div>

            {mode === 'PASS_AND_PLAY' ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <div className="text-xs text-amber-300 font-mono uppercase">
                    Voter {pnpActiveVoterIdx + 1} of {activePlayers.length}
                  </div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {activePlayers[pnpActiveVoterIdx]?.name}'s Vote
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activePlayers.map((p) => {
                    const av = AVATARS[p.avatarId % AVATARS.length];
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          const voter = activePlayers[pnpActiveVoterIdx];
                          if (!voter) return;
                          castVote(voter.id, p.id);
                          if (pnpActiveVoterIdx + 1 < activePlayers.length) {
                            setPnpActiveVoterIdx((i) => i + 1);
                          }
                        }}
                        className="p-3.5 rounded-2xl bg-white/5 hover:bg-rose-600/30 border border-white/15 hover:border-rose-500 flex items-center gap-3 text-left transition-all"
                      >
                        <span className="text-2xl">{av.emoji}</span>
                        <div className="font-bold text-sm text-white">Vote {p.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs sm:text-sm text-slate-300 flex items-center justify-between bg-white/5 px-4 py-2.5 rounded-xl">
                  <span>Tap the player you think is the {deck.spyTitle}:</span>
                  <span className="font-mono font-bold text-amber-300">
                    {totalVotesCast} / {activePlayers.length} Voted
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {activePlayers.map((p) => {
                    const av = AVATARS[p.avatarId % AVATARS.length];
                    const isSelected = selectedVoteTarget === p.id;
                    const count = liveVoteCounts ? liveVoteCounts[p.id] || 0 : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedVoteTarget(p.id);
                          if (myPlayerId) castVote(myPlayerId, p.id);
                        }}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-rose-600/30 border-rose-500 shadow-lg'
                            : 'bg-white/5 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-lg shrink-0`}
                          >
                            {av.emoji}
                          </div>
                          <div className="text-left min-w-0">
                            <div className="font-bold text-sm text-white truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {p.hasVoted ? '✓ Voted' : 'Voting...'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {count !== null && count > 0 && (
                            <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-mono text-xs font-bold">
                              {count}
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-xs font-bold text-rose-300">✓ Picked</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={cancelVote}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-bold"
              >
                ← Resume Questioning
              </button>

              {isHost && (
                <button
                  onClick={forceEndVoting}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold"
                >
                  Reveal Vote Result Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: SPY LOCATION GUESS PHASE
         ===================================================================== */}
      {(status === 'SPY_GUESS' || pnpMidRoundSpyModal) && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full p-6 sm:p-8 rounded-3xl bg-[#121422] border-2 border-rose-500 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-rose-400">
                  🎯 Final Showdown
                </div>
                <h2 className="text-2xl font-black text-white mt-0.5">
                  {spyGuessingPlayerName || deck.spyTitle} is Guessing the {deck.cardNoun}!
                </h2>
              </div>
              {status === 'SPY_GUESS' && (
                <div className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 font-mono font-black text-lg text-rose-300">
                  {phaseCountdown}s
                </div>
              )}
            </div>

            {myRole?.isSpy || mode === 'PASS_AND_PLAY' ? (
              <>
                <p className="text-xs sm:text-sm text-amber-200">
                  Tap the secret <strong>{deck.cardNoun}</strong> below to win the round:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {chosenCards.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => {
                        setPnpMidRoundSpyModal(false);
                        const spyPlayer = players.find((p) => getPassAndPlayRole(p.id)?.isSpy);
                        submitSpyGuess(c.name, spyPlayer?.id || myPlayerId || undefined);
                      }}
                      className="p-3 rounded-2xl bg-white/5 hover:bg-amber-500/25 border border-white/15 hover:border-amber-400 text-left flex items-center gap-2.5 transition-all"
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="font-bold text-xs sm:text-sm text-white truncate">
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
                {pnpMidRoundSpyModal && (
                  <button
                    onClick={() => setPnpMidRoundSpyModal(false)}
                    className="w-full py-2.5 rounded-xl bg-white/10 text-xs font-bold text-slate-300"
                  >
                    Cancel
                  </button>
                )}
              </>
            ) : (
              <div className="py-12 text-center space-y-3">
                <div className="text-5xl animate-bounce">🕵️‍♂️</div>
                <div className="text-lg font-bold text-white">
                  {spyGuessingPlayerName} is guessing the secret {deck.cardNoun.toLowerCase()}...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: ROUND SUMMARY & 1-CLICK NEXT ROUND
         ===================================================================== */}
      {status === 'ROUND_SUMMARY' && lastRoundSummary && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-xl w-full p-6 sm:p-8 rounded-3xl bg-[#111320] border border-white/15 shadow-2xl space-y-6 my-8">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-mono uppercase">
                Round #{roundNumber} Complete
              </div>
              <h2
                className={`text-2xl sm:text-3xl font-black ${
                  lastRoundSummary.outcome === 'SPY_CAUGHT' ||
                  lastRoundSummary.outcome === 'SPY_GUESSED_WRONG'
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {lastRoundSummary.headline}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">{lastRoundSummary.subtext}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <span className="text-4xl">{lastRoundSummary.secretLocationEmoji}</span>
                <div>
                  <div className="text-[11px] font-mono uppercase text-emerald-300">
                    Secret {deck.cardNoun}
                  </div>
                  <div className="text-lg font-black text-white">
                    {lastRoundSummary.secretLocation}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3">
                <span className="text-4xl">🕵️‍♂️</span>
                <div>
                  <div className="text-[11px] font-mono uppercase text-rose-300">
                    The {deck.spyTitle}
                  </div>
                  <div className="text-lg font-black text-white">
                    {lastRoundSummary.spies.map((s) => s.name).join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Standings */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="text-xs font-mono uppercase text-slate-400 mb-2.5">
                Scoreboard
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .map((p, idx) => {
                    const av = AVATARS[p.avatarId % AVATARS.length];
                    const delta = lastRoundSummary.scoreDeltas[p.id] || 0;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono text-slate-400 w-5">
                            #{idx + 1}
                          </span>
                          <span>{av.emoji}</span>
                          <span className="font-bold text-sm text-white">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          {delta > 0 && (
                            <span className="text-xs font-bold text-emerald-400">
                              +{delta}
                            </span>
                          )}
                          <span className="text-sm font-black text-amber-300">
                            {p.score} pts
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {isHost ? (
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={startRound}
                  className="flex-1 py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-black text-white shadow-xl flex items-center justify-center gap-2 transition-all"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>Play Next Round (#{roundNumber + 1})</span>
                </button>
                <button
                  onClick={returnToLobbyKeepScores}
                  className="py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/15 font-bold text-xs text-white"
                >
                  Lobby
                </button>
                <button
                  onClick={showWinnersPodium}
                  className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 font-bold text-xs text-white flex items-center justify-center gap-1.5"
                >
                  <Trophy className="w-4 h-4" />
                  <span>Podium</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-300">
                Waiting for Host to start Round #{roundNumber + 1}...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
