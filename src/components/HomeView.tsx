import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  Sparkles,
  Smartphone,
  Globe,
  Play,
  LogIn,
  HelpCircle,
  Zap,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  Flame,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS, DECKS } from '../data/decks';

interface HomeViewProps {
  initialJoinCode?: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ initialJoinCode = '' }) => {
  const { createRoom, joinRoom, connectionStatus, errorBanner, clearError } = useGame();

  const [activeModal, setActiveModal] = useState<'NONE' | 'CREATE' | 'JOIN' | 'HOW_TO_PLAY'>(
    initialJoinCode ? 'JOIN' : 'NONE'
  );
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('cos_player_name') || '';
  });
  const [avatarId, setAvatarId] = useState<number>(() => {
    const saved = localStorage.getItem('cos_avatar_id');
    return saved ? Number(saved) : Math.floor(Math.random() * AVATARS.length);
  });
  const [roomMode, setRoomMode] = useState<'P2P' | 'PASS_AND_PLAY'>('P2P');
  const [joinCode, setJoinCode] = useState<string[]>(() => {
    const clean = initialJoinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    return [clean[0] || '', clean[1] || '', clean[2] || '', clean[3] || ''];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const codeRefs = [
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (initialJoinCode && initialJoinCode.length === 4) {
      const clean = initialJoinCode.toUpperCase().slice(0, 4);
      setJoinCode([clean[0], clean[1], clean[2], clean[3]]);
      setActiveModal('JOIN');
    }
  }, [initialJoinCode]);

  const handleSaveProfile = (name: string, avId: number) => {
    localStorage.setItem('cos_player_name', name.trim());
    localStorage.setItem('cos_avatar_id', String(avId));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setIsSubmitting(true);
    handleSaveProfile(playerName, avatarId);
    try {
      await createRoom(playerName.trim(), avatarId, roomMode);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = joinCode.join('').trim().toUpperCase();
    if (!playerName.trim() || fullCode.length < 4) return;
    setIsSubmitting(true);
    handleSaveProfile(playerName, avatarId);
    try {
      await joinRoom(fullCode, playerName.trim(), avatarId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeCharChange = (idx: number, val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next = [...joinCode];
    next[idx] = clean;
    setJoinCode(next);
    if (clean && idx < 3) {
      codeRefs[idx + 1].current?.focus();
    }
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !joinCode[idx] && idx > 0) {
      codeRefs[idx - 1].current?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    if (pasted) {
      setJoinCode([pasted[0] || '', pasted[1] || '', pasted[2] || '', pasted[3] || '']);
    }
  };

  const currentAvatar = AVATARS[avatarId % AVATARS.length];

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-rose-600/15 blur-[130px] rounded-full" />
        <div className="absolute top-1/2 -left-32 w-[400px] h-[400px] bg-amber-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[350px] bg-purple-600/10 blur-[130px] rounded-full" />
      </div>

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={() => {
              clearError();
              setActiveModal('NONE');
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30 group-hover:scale-105 transition-transform">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-black tracking-tight text-lg sm:text-xl bg-gradient-to-r from-white via-rose-200 to-amber-300 bg-clip-text text-transparent">
                CIRCLE OF SHAQ
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                v2.0 Zero-Loophole Edition
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setActiveModal('HOW_TO_PLAY')}
              className="px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Rules</span>
            </button>
            <button
              onClick={() => {
                clearError();
                setActiveModal('JOIN');
              }}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 transition-all"
            >
              Join Code
            </button>
            <button
              onClick={() => {
                clearError();
                setActiveModal('CREATE');
              }}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-600/25 transition-all"
            >
              Host Game
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col justify-center">
        {errorBanner && (
          <div className="max-w-md mx-auto mt-4 px-4 w-full">
            <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-3 shadow-lg">
              <span>⚠️ {errorBanner}</span>
              <button
                onClick={clearError}
                className="text-rose-400 hover:text-white font-bold px-2"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {activeModal === 'NONE' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-rose-500/15 via-amber-500/15 to-rose-500/15 border border-rose-500/30 text-amber-300 text-xs sm:text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>"Rise and shine, it's dhokha time…"</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
                EVERYONE IS IN THE{' '}
                <span className="bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                  CIRCLE.
                </span>
                <span className="block mt-2 text-2xl sm:text-4xl lg:text-5xl text-slate-200 font-extrabold">
                  Who is planting the <span className="text-rose-500 underline decoration-wavy decoration-amber-400/60">Shaq</span>?
                </span>
              </h1>

              <p className="mt-5 text-sm sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                The next-generation social deduction party game for <strong className="text-white">3 to 24+ players</strong>.
                Ask sharp questions, spot the <strong className="text-rose-400">Gaddar</strong> before the clock runs out, or blow your cover to steal the round!
              </p>

              {/* CTA Buttons */}
              <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
                <button
                  onClick={() => {
                    clearError();
                    setRoomMode('P2P');
                    setActiveModal('CREATE');
                  }}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-base sm:text-lg shadow-xl shadow-rose-600/30 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.99]"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Create Circle (Host Room)</span>
                </button>

                <button
                  onClick={() => {
                    clearError();
                    setActiveModal('JOIN');
                  }}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-3 transition-all"
                >
                  <LogIn className="w-5 h-5 text-amber-400" />
                  <span>Join with 4-Letter Code</span>
                </button>
              </div>

              {/* Pass & Play Quick Launch */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => {
                    clearError();
                    setRoomMode('PASS_AND_PLAY');
                    setActiveModal('CREATE');
                  }}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-amber-300 transition-colors py-1.5 px-3 rounded-lg hover:bg-white/5"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Playing in-person on 1 phone? Launch <strong>Couch Pass-and-Play Mode</strong></span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Key Upgrades Grid (Highlighting Fixed Loopholes) */}
            <div className="mt-14 sm:mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-rose-500/40 transition-all">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-3.5">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="font-bold text-base text-white">1-Click Instant Restarts</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Zero room recreation! Keep your entire squad, scores, and settings across infinite rounds with fresh card deals & anti-streak spy weighting.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 transition-all">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3.5">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-bold text-base text-white">3 to 24+ Players & Multi-Spy</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Scale up to 24 simultaneous players with 1, 2, or 3 Gaddars (Spies). Toggle whether multiple spies know each other or play blind!
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-emerald-500/40 transition-all">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-3.5">
                  <EyeOff className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-base text-white">Zero Screen-Tell & Blind Votes</h3>
                <p className="text-xs sm:text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Identical UI layout for Spies and Agents so nobody can peek at your phone layout! Simultaneous blind voting stops bandwagon sheep-voting.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/40 transition-all">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-3.5">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="font-bold text-base text-white">Mid-Round Dhokha & Siren</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Spies can blow their cover mid-round to guess the location for 2 pts! Any agent can hit the Shaq Siren to pause the clock and force a vote.
                </p>
              </div>
            </div>

            {/* 4 Curated Decks Preview */}
            <div className="mt-14">
              <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  4 Curated, Bug-Free Decks Included
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Including the exclusive <span className="text-amber-400 font-semibold">Desi Adda & Shaadi</span> deck!
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {DECKS.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => {
                      clearError();
                      setActiveModal('CREATE');
                    }}
                    className="group cursor-pointer p-4 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/10 hover:border-rose-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{d.badgeEmoji}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                          {d.cards.length} {d.cardNoun}s
                        </span>
                      </div>
                      <h4 className="font-bold text-white group-hover:text-rose-400 transition-colors">
                        {d.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{d.tagline}</p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Impostor: <strong className="text-amber-300">{d.spyTitle}</strong></span>
                      <span className="text-rose-400 font-semibold group-hover:translate-x-0.5 transition-transform">Play →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CREATE ROOM MODAL / VIEW */}
        {activeModal === 'CREATE' && (
          <div className="max-w-md w-full mx-auto px-4 py-8">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d]/95 border border-white/15 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-rose-400">
                    Host Setup
                  </span>
                  <h2 className="text-2xl font-black text-white">Create a Circle</h2>
                </div>
                <button
                  onClick={() => setActiveModal('NONE')}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-5">
                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2.5 p-1 rounded-2xl bg-black/40 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setRoomMode('P2P')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      roomMode === 'P2P'
                        ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span>Multi-Device Room</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomMode('PASS_AND_PLAY')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      roomMode === 'PASS_AND_PLAY'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>1-Phone Pass & Play</span>
                  </button>
                </div>

                {/* Avatar Picker */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Choose Your Avatar ({currentAvatar.name})
                  </label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setAvatarId(av.id)}
                        className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-all ${
                          avatarId === av.id
                            ? `bg-gradient-to-br ${av.bg} ring-2 ring-amber-400 scale-110 z-10 shadow-lg`
                            : 'bg-white/5 hover:bg-white/10 opacity-70 hover:opacity-100'
                        }`}
                        title={av.name}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Player Name */}
                <div>
                  <label
                    htmlFor="hostName"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
                  >
                    Your Agent Name
                  </label>
                  <input
                    id="hostName"
                    type="text"
                    required
                    maxLength={22}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="e.g. Kabir, Priya, Agent Shaq..."
                    className="w-full px-4 py-3.5 rounded-xl bg-black/50 border border-white/15 focus:border-rose-500 focus:outline-none text-white font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!playerName.trim() || isSubmitting}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 font-bold text-white shadow-lg shadow-rose-600/25 transition-all"
                >
                  {isSubmitting
                    ? 'Opening Circle...'
                    : roomMode === 'P2P'
                    ? 'Create Room & Get 4-Letter Code'
                    : 'Start Pass & Play Lobby'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* JOIN ROOM MODAL / VIEW */}
        {activeModal === 'JOIN' && (
          <div className="max-w-md w-full mx-auto px-4 py-8">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d]/95 border border-white/15 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                    Enter Existing Circle
                  </span>
                  <h2 className="text-2xl font-black text-white">Join Room</h2>
                </div>
                {/* Safe Back Button — Fixes spyfall.co Loophole #1 where Back sent DELETE /api/rooms/:id! */}
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setActiveModal('NONE');
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  title="Back to Home (Safe - never deletes room)"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-5">
                {/* 4-Character Code Input */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
                    4-Character Room Code
                  </label>
                  <div className="flex justify-center gap-2.5">
                    {joinCode.map((ch, idx) => (
                      <input
                        key={idx}
                        ref={codeRefs[idx]}
                        type="text"
                        maxLength={1}
                        value={ch}
                        onChange={(e) => handleCodeCharChange(idx, e.target.value)}
                        onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                        onPaste={handleCodePaste}
                        placeholder="•"
                        className="w-14 h-16 text-center text-2xl font-black font-mono uppercase rounded-2xl bg-black/60 border-2 border-white/15 focus:border-amber-400 focus:outline-none text-amber-300"
                      />
                    ))}
                  </div>
                </div>

                {/* Avatar Picker */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Pick Your Avatar ({currentAvatar.name})
                  </label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setAvatarId(av.id)}
                        className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-all ${
                          avatarId === av.id
                            ? `bg-gradient-to-br ${av.bg} ring-2 ring-amber-400 scale-110 z-10 shadow-lg`
                            : 'bg-white/5 hover:bg-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Player Name */}
                <div>
                  <label
                    htmlFor="joinPlayerName"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
                  >
                    Your Agent Name
                  </label>
                  <input
                    id="joinPlayerName"
                    type="text"
                    required
                    maxLength={22}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3.5 rounded-xl bg-black/50 border border-white/15 focus:border-amber-400 focus:outline-none text-white font-medium"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      setActiveModal('NONE');
                    }}
                    className="px-5 py-3.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/5 font-semibold text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !playerName.trim() ||
                      joinCode.some((c) => !c) ||
                      isSubmitting ||
                      connectionStatus === 'CONNECTING'
                    }
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 font-bold text-white shadow-lg shadow-rose-600/25 transition-all"
                  >
                    {isSubmitting || connectionStatus === 'CONNECTING'
                      ? 'Joining Circle...'
                      : 'Enter Circle'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* HOW TO PLAY MODAL */}
        {activeModal === 'HOW_TO_PLAY' && (
          <div className="max-w-3xl w-full mx-auto px-4 py-8">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d]/95 border border-white/15 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                    Field Manual
                  </span>
                  <h2 className="text-2xl font-black text-white">
                    How to Play CIRCLE OF SHAQ
                  </h2>
                </div>
                <button
                  onClick={() => setActiveModal('NONE')}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="flex items-center gap-2 font-bold text-emerald-300 mb-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>If You Are an Insider (Agent)</span>
                  </div>
                  <ul className="space-y-2 text-slate-300 text-xs leading-relaxed">
                    <li>• Everyone except the <strong>Gaddar (Spy)</strong> sees the exact same secret Location (or Adda/Animal/Country) and receives a unique role.</li>
                    <li>• Take turns asking another player a subtle question. Answer clearly enough that fellow Insiders trust you, but vague enough that the Gaddar can't deduce the location!</li>
                    <li>• Use the <strong>Circle Board</strong> to tag players as <em>Shaq (Suspect)</em> or <em>Pakka (Cleared)</em>.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                  <div className="flex items-center gap-2 font-bold text-rose-300 mb-2">
                    <ShieldAlert className="w-5 h-5" />
                    <span>If You Are the Gaddar (Spy)</span>
                  </div>
                  <ul className="space-y-2 text-slate-300 text-xs leading-relaxed">
                    <li>• You do <strong>NOT</strong> know the secret location! Listen closely to the questions and answers to cross out impossible locations on your grid.</li>
                    <li>• <strong>Blow Cover Mid-Round:</strong> At any moment, if you figure out the location, hit <em>"Blow Cover & Guess Location"</em> to steal <strong>+2 points</strong> immediately!</li>
                    <li>• Even if the Circle votes you out, you get a <strong>35-second Last Chance</strong> to guess the location and earn +1 point!</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  <span>Scoring & Golden Rules</span>
                </div>
                <p>1. <strong>No Immediate Ask-Backs:</strong> If A questions B, B cannot immediately question A—they must pass the mic to someone else in the Circle.</p>
                <p>2. <strong>Mid-Round Shaq Siren:</strong> Any player can trigger an accusation vote mid-round (once per round), pausing the clock.</p>
                <p>3. <strong>Points:</strong> Spy Escapes = <strong>+2 pts to Spy</strong> | Spy Blows Cover & Guesses Right = <strong>+2 pts to Spy</strong> | Circle Catches Spy = <strong>+1 pt to all Agents (+2 pts to those who voted for the Spy)</strong>.</p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveModal('CREATE')}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 font-bold text-sm text-white"
                >
                  Got It — Let's Play!
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-5 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-slate-300">CIRCLE OF SHAQ</strong> — "Rise and shine, it's dhokha time…"
          </div>
          <div>
            Engineered with Zero-Leak WebRTC & Instant Multi-Round Architecture
          </div>
        </div>
      </footer>
    </div>
  );
};
