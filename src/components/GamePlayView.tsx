import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Eye,
  EyeOff,
  Siren,
  ShieldAlert,
  Mic,
  HelpCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trophy,
  StickyNote,
  LogOut,
  Users,
  Layers,
  Award,
  Sparkles,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS, getDeckById } from '../data/decks';

type SuspectTag = 'UNKNOWN' | 'SHAQ' | 'PAKKA';

export const GamePlayView: React.FC = () => {
  const {
    roomState,
    myRole,
    myPlayerId,
    isHost,
    leaveRoom,
    passMic,
    callVote,
    castVote,
    forceEndVoting,
    blowCoverAsSpy,
    submitSpyGuess,
    manualHostOutcome,
    startRound,
    showWinnersPodium,
    returnToLobbyKeepScores,
    getPassAndPlayRole,
    errorBanner,
    clearError,
  } = useGame();

  // Local interactive states (automatically reset on every new roundNumber!)
  const [isCardHidden, setIsCardHidden] = useState(false);
  const [suspectTags, setSuspectTags] = useState<Record<string, SuspectTag>>({});
  const [playerNotes, setPlayerNotes] = useState<Record<string, string>>({});
  const [activeNotePlayerId, setActiveNotePlayerId] = useState<string | null>(null);
  const [crossedLocations, setCrossedLocations] = useState<Record<string, boolean>>({});
  const [questionHint, setQuestionHint] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'SUSPECTS' | 'LOCATIONS'>('SUSPECTS');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(480);
  const [phaseCountdown, setPhaseCountdown] = useState<number>(35);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);

  // Pass-and-Play sequential card reveal state
  const [pnpRevealIndex, setPnpRevealIndex] = useState<number>(0);
  const [pnpCardOpened, setPnpCardOpened] = useState<boolean>(false);
  const [pnpAllRevealed, setPnpAllRevealed] = useState<boolean>(false);
  const [pnpActiveVoterIdx, setPnpActiveVoterIdx] = useState<number>(0);
  const [pnpMidRoundSpyModal, setPnpMidRoundSpyModal] = useState<boolean>(false);

  const roundNumber = roomState?.roundNumber || 1;

  // Reset local markings cleanly whenever a new round starts! (Fixes Loophole #4)
  useEffect(() => {
    setSuspectTags({});
    setPlayerNotes({});
    setActiveNotePlayerId(null);
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

  // Synchronized countdown timer
  useEffect(() => {
    if (!roomState) return;
    const tick = () => {
      const now = Date.now();
      if (roomState.status === 'PLAYING' && roomState.roundEndsAt) {
        setRemainingSeconds(Math.max(0, Math.ceil((roomState.roundEndsAt - now) / 1000)));
      } else if (roomState.pausedRemainingMs !== null) {
        setRemainingSeconds(Math.max(0, Math.ceil(roomState.pausedRemainingMs / 1000)));
      }

      if (roomState.status === 'VOTING' && roomState.votingEndsAt) {
        setPhaseCountdown(Math.max(0, Math.ceil((roomState.votingEndsAt - now) / 1000)));
      } else if (roomState.status === 'SPY_GUESS' && roomState.spyGuessEndsAt) {
        setPhaseCountdown(Math.max(0, Math.ceil((roomState.spyGuessEndsAt - now) / 1000)));
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [roomState]);

  if (!roomState) return null;

  const {
    roomId,
    mode,
    status,
    settings,
    players,
    chosenCards,
    currentTurn,
    logs,
    lastRoundSummary,
    liveVoteCounts,
    totalVotesCast,
    spyGuessingPlayerId,
    spyGuessingPlayerName,
  } = roomState;

  const deck = getDeckById(settings.deckId);
  const activePlayers = players.filter((p) => !p.isSpectator);
  const me = players.find((p) => p.id === myPlayerId);
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
            Pass-and-Play Secret Deal ({pnpRevealIndex + 1} of {activePlayers.length})
          </div>

          <div className="flex flex-col items-center">
            <div
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-3xl shadow-lg mb-3`}
            >
              {av.emoji}
            </div>
            <h2 className="text-2xl font-black text-white">
              Hand Phone to <span className="text-rose-400">{currentPnpPlayer?.name}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Make sure nobody else is peeking at the screen!
            </p>
          </div>

          {!pnpCardOpened ? (
            <button
              onClick={() => setPnpCardOpened(true)}
              className="w-full py-12 rounded-2xl bg-gradient-to-br from-rose-950/60 to-amber-950/40 border-2 border-dashed border-rose-500/50 hover:border-amber-400 flex flex-col items-center justify-center gap-3 transition-all"
            >
              <Eye className="w-8 h-8 text-amber-400" />
              <span className="font-bold text-base text-white">
                Tap to Reveal {currentPnpPlayer?.name}'s Secret Identity
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
                    Blend in! Listen to others' questions and deduce the secret {deck.cardNoun.toLowerCase()}.
                  </p>
                  {currentPnpRole.fellowSpies.length > 0 && (
                    <div className="p-2 rounded-xl bg-black/40 text-xs text-amber-300 font-semibold">
                      Partner in Crime: {currentPnpRole.fellowSpies.map((s) => s.name).join(', ')}
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
                    Your Role: {currentPnpRole?.role}
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
                ? 'Hide Role & Pass to Next Player →'
                : 'Hide Role & Start Round Timer! 🚀'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col">
      {/* Sticky Top Header & Live Timer Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
          {/* Brand + Round Pill */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-tight">
                  CIRCLE OF SHAQ
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Round #{roundNumber}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Room <strong className="text-amber-300">{roomId}</strong> • {deck.name}
              </div>
            </div>
          </div>

          {/* Central Countdown Clock + Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`px-3.5 py-1.5 rounded-xl font-mono font-black text-lg sm:text-xl border flex items-center gap-2 ${
                remainingSeconds <= 60
                  ? 'bg-rose-950/90 border-rose-500 text-rose-400 animate-pulse'
                  : 'bg-white/5 border-white/15 text-amber-300'
              }`}
            >
              <span>⏱️ {formatTime(remainingSeconds)}</span>
            </div>

            {status === 'PLAYING' && (
              <>
                <button
                  onClick={() => callVote(myPlayerId || undefined)}
                  className="px-3 sm:px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="Pause timer & call a Circle Vote"
                >
                  <Siren className="w-4 h-4 text-amber-400" />
                  <span>Shaq Siren (Vote)</span>
                </button>

                {/* Mid-Round Spy Reveal Button! (Fixes Loophole #7 where Spies couldn't guess mid-round!) */}
                {(myRole?.isSpy || mode === 'PASS_AND_PLAY') && (
                  <button
                    onClick={() => {
                      if (mode === 'PASS_AND_PLAY') {
                        setPnpMidRoundSpyModal(true);
                      } else {
                        blowCoverAsSpy(myPlayerId || undefined);
                      }
                    }}
                    className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all"
                    title="Reveal yourself as the Gaddar and guess the location for +2 pts!"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="hidden sm:inline">Blow Cover</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={leaveRoom}
              className="p-2 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white"
              title="Exit Room"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Smooth Progress Bar */}
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

      {/* MAIN UNIFIED WORKSPACE (Zero Screen-Tell Layout — Fixes Loophole #3!) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Secret Identity Card + Question Mic Tracker + Question Helper (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* 1. 3D Privacy Role Card */}
          <div className="p-4 rounded-3xl bg-[#10121d] border border-white/10 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Your Classified Identity
              </span>
              <button
                onClick={() => setIsCardHidden((h) => !h)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-amber-300 flex items-center gap-1"
              >
                {isCardHidden ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show Card</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide (Anti-Peek)</span>
                  </>
                )}
              </button>
            </div>

            {mode === 'PASS_AND_PLAY' ? (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-black border border-white/10 text-center space-y-2">
                <div className="text-2xl">🔒</div>
                <div className="font-bold text-sm text-white">
                  Pass-and-Play Privacy Mode Active
                </div>
                <p className="text-xs text-slate-400">
                  Roles are hidden so everyone can view the shared Circle Board & Location Matrix together!
                </p>
                <button
                  onClick={() => {
                    setPnpRevealIndex(0);
                    setPnpCardOpened(false);
                    setPnpAllRevealed(false);
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-amber-300 font-semibold"
                >
                  Re-check Roles Privately
                </button>
              </div>
            ) : isCardHidden || !myRole ? (
              <div
                onClick={() => setIsCardHidden(false)}
                className="cursor-pointer py-10 px-4 rounded-2xl bg-gradient-to-br from-slate-900 via-[#151828] to-black border-2 border-dashed border-white/15 hover:border-amber-400/50 text-center space-y-2 transition-all"
              >
                <Eye className="w-8 h-8 text-amber-400 mx-auto" />
                <div className="font-bold text-sm text-white">Identity Hidden from Peekers</div>
                <div className="text-xs text-slate-400">Tap anywhere on this card to reveal</div>
              </div>
            ) : (
              /* IMPORTANT: Both Spy and Innocent cards use the exact same dimensions & neutral dark container so someone glancing from across the room cannot tell by screen glow! */
              <div
                onClick={() => setIsCardHidden(true)}
                className="cursor-pointer p-5 rounded-2xl bg-gradient-to-br from-[#16192b] to-[#0c0e18] border border-white/15 hover:border-white/30 text-center space-y-2.5 transition-all"
              >
                <div className="text-3xl">
                  {myRole.isSpy ? '🕵️‍♂️' : myRole.locationEmoji || '📍'}
                </div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
                  {myRole.isSpy ? 'Undercover Mission' : `Assigned ${deck.cardNoun}`}
                </div>
                <div className="text-2xl font-black text-white">
                  {myRole.isSpy ? `YOU ARE THE ${deck.spyTitle.toUpperCase()}` : myRole.location}
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-white/10 text-slate-200 text-xs font-semibold">
                  {myRole.isSpy
                    ? `Deduce the secret ${deck.cardNoun.toLowerCase()}!`
                    : `Role: ${myRole.role}`}
                </div>
                {myRole.isSpy && myRole.fellowSpies.length > 0 && (
                  <div className="text-xs text-amber-300 font-mono">
                    Co-Gaddar: {myRole.fellowSpies.map((s) => s.name).join(', ')}
                  </div>
                )}
                <div className="text-[10px] text-slate-500 pt-1">
                  Tap card to hide from nearby eyes
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Question Turn Tracker ("Pass the Mic") — Fixes Loophole #11 */}
          <div className="p-4 rounded-3xl bg-[#10121d] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Mic className="w-4 h-4 text-rose-400" />
                <span>Live Question Floor</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">No Immediate Ask-Backs</span>
            </div>

            {currentTurn ? (
              <div className="p-3 rounded-2xl bg-gradient-to-r from-rose-500/15 via-amber-500/10 to-emerald-500/15 border border-white/10">
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                  <span className="text-rose-300 truncate">{currentTurn.askerName}</span>
                  <span className="text-amber-400 font-mono px-2">➔ asking ➔</span>
                  <span className="text-emerald-300 truncate">{currentTurn.targetName}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  Next up: <strong>{currentTurn.targetName}</strong> answers, then clicks any player on the Circle Board to question next!
                </div>
              </div>
            ) : null}

            {/* Question Idea Generator */}
            <div className="pt-1">
              <button
                onClick={generateRandomQuestion}
                className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Need a Question Idea? Tap Here</span>
              </button>
              {questionHint && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-100 italic">
                  "{questionHint}"
                </div>
              )}
            </div>
          </div>

          {/* 3. Live Activity Feed */}
          <div className="hidden lg:block p-4 rounded-3xl bg-[#10121d] border border-white/10">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2.5">
              Circle Activity Log
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs pr-1">
              {logs.map((item) => (
                <div
                  key={item.id}
                  className="py-1.5 px-2.5 rounded-lg bg-white/[0.02] text-slate-300 border-l-2 border-rose-500/50"
                >
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Unified Suspects Board & Locations Matrix (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Mobile Switcher Tabs so both Spy and Agent have fast 1-tap access without scrolling */}
          <div className="flex lg:hidden p-1 rounded-2xl bg-[#10121d] border border-white/10">
            <button
              onClick={() => setMobileTab('SUSPECTS')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                mobileTab === 'SUSPECTS'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Suspects ({activePlayers.length})</span>
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

          {/* SECTION A: SUSPECTS BOARD (Compact High-Density Pills for up to 24 Players!) */}
          <div
            className={`${
              mobileTab === 'LOCATIONS' ? 'hidden lg:block' : 'block'
            } p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>The Circle Suspects Board</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({activePlayers.length} Players)
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Tap a player card to cycle{' '}
                  <span className="text-rose-400 font-semibold">Shaq (Suspect)</span> /{' '}
                  <span className="text-emerald-400 font-semibold">Pakka (Cleared)</span>. Use{' '}
                  <span className="text-amber-300 font-semibold">Ask 🎤</span> to pass the question floor!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {activePlayers.map((p) => {
                const av = AVATARS[p.avatarId % AVATARS.length];
                const tag = suspectTags[p.id] || 'UNKNOWN';
                const isCurrentTarget = currentTurn?.targetId === p.id;
                const isCurrentAsker = currentTurn?.askerId === p.id;
                const noteText = playerNotes[p.id] || '';

                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                      tag === 'SHAQ'
                        ? 'bg-rose-950/35 border-rose-500/60'
                        : tag === 'PAKKA'
                        ? 'bg-emerald-950/30 border-emerald-500/50'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Clicking left side cycles Suspect / Cleared tag */}
                      <button
                        type="button"
                        onClick={() => cycleSuspectTag(p.id)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-lg shrink-0 relative`}
                        >
                          {av.emoji}
                          {isCurrentTarget && (
                            <span
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-black"
                              title="Answering Now"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{p.name}</span>
                            {p.id === myPlayerId && (
                              <span className="text-[10px] text-rose-400 font-mono">(You)</span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                            <span className="text-amber-300 font-semibold">{p.score} pts</span>
                            <span>• Asked: {p.timesQuestioned}x</span>
                          </div>
                        </div>
                      </button>

                      {/* Right side action badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Status Pill */}
                        <button
                          type="button"
                          onClick={() => cycleSuspectTag(p.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase ${
                            tag === 'SHAQ'
                              ? 'bg-rose-500 text-white'
                              : tag === 'PAKKA'
                              ? 'bg-emerald-500 text-black'
                              : 'bg-white/10 text-slate-400'
                          }`}
                        >
                          {tag === 'SHAQ' ? '🚨 SHAQ' : tag === 'PAKKA' ? '✓ PAKKA' : '?'}
                        </button>

                        {/* Pass Question Mic Button */}
                        {status === 'PLAYING' && (
                          <button
                            type="button"
                            onClick={() =>
                              passMic(
                                currentTurn?.targetId || myPlayerId || activePlayers[0].id,
                                p.id
                              )
                            }
                            className={`p-1.5 rounded-lg border text-xs transition-colors ${
                              isCurrentAsker || isCurrentTarget
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300'
                            }`}
                            title={`Question ${p.name} next`}
                          >
                            <Mic className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Compact Note Toggle (Replaces spyfall.co's giant 112px textarea clutter!) */}
                        <button
                          type="button"
                          onClick={() =>
                            setActiveNotePlayerId((cur) => (cur === p.id ? null : p.id))
                          }
                          className={`p-1.5 rounded-lg border transition-colors ${
                            noteText
                              ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                          title="Add private note"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Quick-Note Input */}
                    {(activeNotePlayerId === p.id || noteText) && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) =>
                            setPlayerNotes((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={`Private note on ${p.name}...`}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION B: POSSIBLE LOCATIONS MATRIX (Always visible on desktop for BOTH Spy & Agents!) */}
          <div
            className={`${
              mobileTab === 'SUSPECTS' ? 'hidden lg:block' : 'block'
            } p-4 sm:p-5 rounded-3xl bg-[#10121d] border border-white/10`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-black text-white">
                  Possible {deck.cardNoun}s Matrix ({chosenCards.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Tap any {deck.cardNoun.toLowerCase()} to cross it off your private deduction list.
                </p>
              </div>
              {Object.values(crossedLocations).some(Boolean) && (
                <button
                  onClick={() => setCrossedLocations({})}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                >
                  Reset Crossed
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {chosenCards.map((card) => {
                const isCrossed = Boolean(crossedLocations[card.name]);
                const isMyLocation = !myRole?.isSpy && myRole?.location === card.name && !isCardHidden && mode !== 'PASS_AND_PLAY';
                return (
                  <button
                    key={card.name}
                    type="button"
                    onClick={() => toggleLocationCard(card.name)}
                    className={`relative p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      isCrossed
                        ? 'bg-black/40 border-white/5 opacity-40 line-through text-slate-500'
                        : isMyLocation
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow'
                        : 'bg-white/[0.03] border-white/10 hover:border-amber-400/50 text-white'
                    }`}
                  >
                    <span className="text-2xl shrink-0">{card.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs sm:text-sm truncate">{card.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{card.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* =====================================================================
          MODAL 1: VOTING OVERLAY (Blind or Live Voting)
         ===================================================================== */}
      {status === 'VOTING' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full p-6 sm:p-8 rounded-3xl bg-[#111422] border-2 border-amber-500/50 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono uppercase tracking-widest">
                  <Siren className="w-4 h-4 animate-bounce" />
                  <span>Circle Judgment Phase • {roomState.votingCallerName}</span>
                </div>
                <h2 className="text-2xl font-black text-white mt-1">
                  Who is the {deck.spyTitle}?
                </h2>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/40 font-mono font-black text-lg text-amber-300">
                {phaseCountdown}s
              </div>
            </div>

            {mode === 'PASS_AND_PLAY' ? (
              /* Pass-and-Play sequential voting */
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <div className="text-xs text-amber-300 font-mono uppercase">
                    Pass Phone to Voter ({pnpActiveVoterIdx + 1} of {activePlayers.length})
                  </div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {activePlayers[pnpActiveVoterIdx]?.name}'s Turn to Vote
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
                        <div>
                          <div className="font-bold text-sm text-white">Accuse {p.name}</div>
                          <div className="text-[11px] text-slate-400">Tap to lock in vote</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Multi-Device Simultaneous Voting */
              <>
                <div className="text-xs sm:text-sm text-slate-300 flex items-center justify-between bg-white/5 px-4 py-2.5 rounded-xl">
                  <span>
                    {settings.votingMode === 'BLIND_MAJORITY'
                      ? '🔒 Blind Voting Active: Individual tallies stay hidden until everyone votes!'
                      : '📊 Live Voting Active: Select who you suspect is the Gaddar.'}
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {totalVotesCast} / {activePlayers.length} Voted
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
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
                              {p.hasVoted ? '✓ Vote Locked' : 'Thinking...'}
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
                            <span className="text-xs font-bold text-rose-300">Your Vote</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {isHost && (
              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Host Controls:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={forceEndVoting}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold"
                  >
                    Finalize Vote Tally Now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: SPY LOCATION GUESS PHASE (Mid-Round Blow Cover OR Caught Last-Chance)
         ===================================================================== */}
      {(status === 'SPY_GUESS' || pnpMidRoundSpyModal) && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-3xl w-full p-6 sm:p-8 rounded-3xl bg-[#121422] border-2 border-rose-500 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-rose-400">
                  🎯 High-Stakes Showdown
                </div>
                <h2 className="text-2xl font-black text-white mt-0.5">
                  {spyGuessingPlayerName || deck.spyTitle} is Guessing the Secret {deck.cardNoun}!
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
                  Select the exact <strong>{deck.cardNoun}</strong> below! If you are right, you steal the round victory!
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
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
                  Hold your breath! {spyGuessingPlayerName} is picking from {chosenCards.length} {deck.cardNoun.toLowerCase()}s...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: ROUND SUMMARY & INSTANT 1-CLICK RESTART (Fixes Loophole #4!)
         ===================================================================== */}
      {status === 'ROUND_SUMMARY' && lastRoundSummary && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full p-6 sm:p-8 rounded-3xl bg-[#111320] border border-white/15 shadow-2xl space-y-6 my-8">
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

            {/* Revealed Secret Location & Spies */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <span className="text-4xl">{lastRoundSummary.secretLocationEmoji}</span>
                <div>
                  <div className="text-[11px] font-mono uppercase text-emerald-300">
                    Actual Secret {deck.cardNoun}
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
                    The {deck.spyTitle}(s)
                  </div>
                  <div className="text-lg font-black text-white">
                    {lastRoundSummary.spies.map((s) => s.name).join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Updated Standings Preview */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="text-xs font-mono uppercase text-slate-400 mb-3">
                Updated Circle Standings
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .map((p, idx) => {
                    const av = AVATARS[p.avatarId % AVATARS.length];
                    const delta = lastRoundSummary.scoreDeltas[p.id] || 0;
                    const wasSpy = lastRoundSummary.spies.some((s) => s.id === p.id);
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
                          {wasSpy && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono">
                              {deck.spyTitle}
                            </span>
                          )}
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

            {/* Instant 1-Click Next Round / Lobby / Podium Controls */}
            {isHost ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={startRound}
                  className="flex-1 py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-black text-white shadow-xl flex items-center justify-center gap-2 transition-all"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>Instant Next Round (#{roundNumber + 1})</span>
                </button>
                <button
                  onClick={returnToLobbyKeepScores}
                  className="py-4 px-4 rounded-2xl bg-white/10 hover:bg-white/15 font-bold text-xs sm:text-sm text-white"
                >
                  Change Deck / Settings
                </button>
                <button
                  onClick={showWinnersPodium}
                  className="py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-1.5"
                >
                  <Trophy className="w-4 h-4" />
                  <span>End Match & Podium</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-300 animate-pulse">
                Waiting for Host to launch Round #{roundNumber + 1}...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
