import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sparkles,
  Smartphone,
  Globe,
  Play,
  LogIn,
  HelpCircle,
  CheckCircle2,
  Flame,
  ChevronRight,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS } from '../data/decks';

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
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-rose-600/15 blur-[130px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[450px] h-[300px] bg-amber-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={() => {
              clearError();
              setActiveModal('NONE');
            }}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-amber-500 flex items-center justify-center shadow-lg">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <span className="font-black tracking-tight text-lg bg-gradient-to-r from-white via-rose-200 to-amber-300 bg-clip-text text-transparent">
              CIRCLE OF SHAQ
            </span>
          </div>

          <button
            onClick={() => setActiveModal('HOW_TO_PLAY')}
            className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>How to Play</span>
          </button>
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
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-amber-300 text-xs sm:text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>"Rise and shine, it's dhokha time…"</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
              FIND THE{' '}
              <span className="bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                GADDAR
              </span>{' '}
              IN THE CIRCLE.
            </h1>

            <p className="mt-4 text-sm sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Everyone gets the same secret location — except the <strong className="text-rose-400">Spy</strong>.
              Ask questions, spot the fake, and hit the <strong className="text-amber-300">Shaq Siren</strong> to vote!
            </p>

            {/* Primary CTA Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <button
                onClick={() => {
                  clearError();
                  setRoomMode('P2P');
                  setActiveModal('CREATE');
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-base sm:text-lg shadow-xl shadow-rose-600/30 flex items-center justify-center gap-3 transition-all"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Create Room (Host)</span>
              </button>

              <button
                onClick={() => {
                  clearError();
                  setActiveModal('JOIN');
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-3 transition-all"
              >
                <LogIn className="w-5 h-5 text-amber-400" />
                <span>Join Room Code</span>
              </button>
            </div>

            {/* Pass & Play Quick Launch */}
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => {
                  clearError();
                  setRoomMode('PASS_AND_PLAY');
                  setActiveModal('CREATE');
                }}
                className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-amber-300 transition-colors py-2 px-4 rounded-xl hover:bg-white/5"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Playing on 1 phone? Use <strong>Pass & Play Mode</strong></span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* CREATE ROOM MODAL */}
        {activeModal === 'CREATE' && (
          <div className="max-w-md w-full mx-auto px-4 py-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d] border border-white/15 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-white">Create a Room</h2>
                <button
                  onClick={() => setActiveModal('NONE')}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-black/40 border border-white/10">
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
                    <span>Multi-Device</span>
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
                    <span>1-Phone Pass</span>
                  </button>
                </div>

                {/* Simple 1-Tap Avatar + Name Row */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Your Name & Avatar (Tap icon to change)
                  </label>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAvatarId((a) => (a + 1) % AVATARS.length)}
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${currentAvatar.bg} flex items-center justify-center text-2xl shrink-0 shadow-lg ring-2 ring-white/20 hover:ring-amber-400 transition-all`}
                      title="Tap to change avatar"
                    >
                      {currentAvatar.emoji}
                    </button>
                    <input
                      id="hostName"
                      type="text"
                      required
                      maxLength={22}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Enter your name..."
                      className="flex-1 px-4 py-3.5 rounded-2xl bg-black/50 border border-white/15 focus:border-rose-500 focus:outline-none text-white font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!playerName.trim() || isSubmitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 font-black text-white shadow-lg shadow-rose-600/25 transition-all"
                >
                  {isSubmitting ? 'Creating Room...' : 'Create Room →'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* JOIN ROOM MODAL */}
        {activeModal === 'JOIN' && (
          <div className="max-w-md w-full mx-auto px-4 py-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d] border border-white/15 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-white">Join Room</h2>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setActiveModal('NONE');
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
                    4-Letter Room Code
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

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Your Name & Avatar (Tap icon to change)
                  </label>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAvatarId((a) => (a + 1) % AVATARS.length)}
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${currentAvatar.bg} flex items-center justify-center text-2xl shrink-0 shadow-lg ring-2 ring-white/20 hover:ring-amber-400 transition-all`}
                      title="Tap to change avatar"
                    >
                      {currentAvatar.emoji}
                    </button>
                    <input
                      id="joinPlayerName"
                      type="text"
                      required
                      maxLength={22}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Enter your name..."
                      className="flex-1 px-4 py-3.5 rounded-2xl bg-black/50 border border-white/15 focus:border-amber-400 focus:outline-none text-white font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    !playerName.trim() ||
                    joinCode.some((c) => !c) ||
                    isSubmitting ||
                    connectionStatus === 'CONNECTING'
                  }
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 font-black text-white shadow-lg shadow-rose-600/25 transition-all"
                >
                  {isSubmitting || connectionStatus === 'CONNECTING'
                    ? 'Joining Room...'
                    : 'Join Game →'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* HOW TO PLAY MODAL */}
        {activeModal === 'HOW_TO_PLAY' && (
          <div className="max-w-xl w-full mx-auto px-4 py-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#10121d] border border-white/15 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="text-xl font-black text-white">How to Play (3 Simple Steps)</h2>
                <button
                  onClick={() => setActiveModal('NONE')}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="flex items-center gap-2 font-bold text-emerald-300 mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>1. Insiders Get the Secret Location</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Everyone sees the exact same location on their phone — except the <strong>Gaddar (Spy)</strong>!
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                  <div className="flex items-center gap-2 font-bold text-amber-300 mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span>2. Ask Questions Out Loud</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Take turns asking each other questions. Give answers that prove to other Insiders you know the location, without making it too obvious for the Spy!
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                  <div className="flex items-center gap-2 font-bold text-rose-300 mb-1">
                    <ShieldAlert className="w-4 h-4" />
                    <span>3. Ring the Shaq Siren to Vote!</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Suspect someone? Hit <strong>🚨 Ring Shaq Siren</strong> anytime to call a group vote, or if you're the Spy, hit <strong>Blow Cover</strong> to guess the location and steal the win!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveModal('NONE')}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 font-bold text-sm text-white"
              >
                Got It!
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
