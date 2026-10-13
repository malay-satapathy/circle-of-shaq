import React, { useState } from 'react';
import { RoomQrBadge } from './VisualEffects';
import {
  Copy,
  Check,
  QrCode,
  Sliders,
  Users,
  Play,
  LogOut,
  Plus,
  Trash2,
  Clock,
  Layers,
  ShieldAlert,
  Eye,
  EyeOff,
  Crown,
  Flame,
  Sparkles,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS, DECKS, getDeckById } from '../data/decks';
import { VotingMode } from '../engine/gameEngine';

export const LobbyView: React.FC = () => {
  const {
    roomState,
    myPlayerId,
    isHost,
    leaveRoom,
    updateSettings,
    updateMyAvatar,
    startRound,
    addPassAndPlayPlayer,
    removePlayer,
    errorBanner,
    clearError,
  } = useGame();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [newPnpName, setNewPnpName] = useState('');
  const [newPnpAvatar, setNewPnpAvatar] = useState(2);

  if (!roomState) return null;

  const { roomId, mode, settings, players } = roomState;
  const currentDeck = getDeckById(settings.deckId);
  const me = players.find((p) => p.id === myPlayerId);
  const shareUrl = `${window.location.origin}${window.location.pathname}?join=${roomId}`;
  const durationMinutes = Math.round(settings.timerDurationSeconds / 60);

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleAddPassAndPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPnpName.trim()) return;
    addPassAndPlayPlayer(newPnpName.trim(), newPnpAvatar);
    setNewPnpName('');
    setNewPnpAvatar((prev) => (prev + 1) % AVATARS.length);
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-black text-base sm:text-lg tracking-tight text-white">
                CIRCLE OF SHAQ
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {mode === 'PASS_AND_PLAY' ? '📱 1-Phone Pass & Play' : `🌐 Live Room #${roomId}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode !== 'PASS_AND_PLAY' && (
              <button
                onClick={() => setShowQrModal(true)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold flex items-center gap-1.5 text-amber-300"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">QR Invite</span>
              </button>
            )}
            <button
              onClick={leaveRoom}
              className="px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/15 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave</span>
            </button>
          </div>
        </div>
      </header>

      {errorBanner && (
        <div className="max-w-4xl mx-auto mt-4 px-4 w-full">
          <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs sm:text-sm flex items-center justify-between">
            <span>⚠️ {errorBanner}</span>
            <button onClick={clearError} className="text-rose-400 hover:text-white font-bold">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Lobby Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Room Code & Players List (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Room Invite Card */}
          {mode !== 'PASS_AND_PLAY' ? (
            <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-rose-950/50 via-[#101320] to-amber-950/30 border border-rose-500/30 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
                    Share Circle Code
                  </span>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-4xl sm:text-5xl font-black font-mono tracking-widest bg-gradient-to-r from-white via-rose-200 to-amber-300 bg-clip-text text-transparent">
                      {roomId}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 transition-colors"
                      title="Copy 4-letter Room Code"
                    >
                      {copiedCode ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setShowQrModal(true)}
                  className="p-2 rounded-2xl bg-white text-black hover:scale-105 transition-transform shadow-lg"
                  title="Show QR Code"
                >
                  <RoomQrBadge value={shareUrl} code={roomId} size={64} />
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Direct Invite Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Instant Join Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Pass and Play Add Player Card */
            <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-950/50 via-[#101320] to-teal-950/30 border border-emerald-500/30 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-mono uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Couch Pass-and-Play Mode</span>
              </div>
              <h2 className="text-xl font-black text-white">Add Players in the Room</h2>
              <p className="text-xs text-slate-400 mt-1">
                Pass this device around to reveal each player's secret role before starting the timer!
              </p>

              <form onSubmit={handleAddPassAndPlay} className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewPnpAvatar((a) => (a + 1) % AVATARS.length)}
                  className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-xl shrink-0"
                  title="Tap to change avatar"
                >
                  {AVATARS[newPnpAvatar % AVATARS.length].emoji}
                </button>
                <input
                  type="text"
                  maxLength={22}
                  value={newPnpName}
                  onChange={(e) => setNewPnpName(e.target.value)}
                  placeholder="Enter friend's name..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-emerald-400 focus:outline-none text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={!newPnpName.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </form>
            </div>
          )}

          {/* Players Roster (Supports 3 to 24+ Players) */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#10121d] border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-base sm:text-lg text-white">
                  Players in the Circle
                </h3>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
                  players.length >= 3
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {players.length} / 24 Ready
              </span>
            </div>

            {me && mode !== 'PASS_AND_PLAY' && (
              <div className="mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="text-[11px] text-slate-400 mb-2">
                  Tap an icon to change your avatar:
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {AVATARS.map((av) => (
                    <button
                      key={av.id}
                      onClick={() => updateMyAvatar(av.id)}
                      className={`aspect-square rounded-lg flex items-center justify-center text-base transition-all ${
                        me.avatarId === av.id
                          ? `bg-gradient-to-br ${av.bg} ring-2 ring-amber-400 scale-105`
                          : 'bg-white/5 hover:bg-white/10 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {av.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {players.map((p) => {
                const av = AVATARS[p.avatarId % AVATARS.length];
                const isMe = p.id === myPlayerId;
                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                      isMe
                        ? 'bg-rose-500/10 border-rose-500/40'
                        : 'bg-white/[0.03] border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${av.bg} flex items-center justify-center text-xl shrink-0 shadow`}
                      >
                        {av.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {p.isHost && (
                            <span title="Host" className="shrink-0">
                              <Crown className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                          <span>{p.score} pts</span>
                          {isMe && <span className="text-rose-400 font-semibold">(You)</span>}
                          {!p.isConnected && mode !== 'PASS_AND_PLAY' && (
                            <span className="text-amber-400">Reconnecting...</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isHost && !p.isHost && (
                      <button
                        onClick={() => removePlayer(p.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove player"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {players.length < 3 && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs text-center">
                Waiting for at least <strong>{3 - players.length} more</strong> player(s) to start the Circle!
              </div>
            )}

            {/* Start Button */}
            <div className="mt-5">
              {isHost ? (
                <button
                  onClick={startRound}
                  disabled={players.length < 3}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-40 font-black text-base text-white shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2.5 transition-all"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {roomState.roundNumber > 0
                      ? `Start Round #${roomState.roundNumber + 1}`
                      : 'Launch Round #1 — Dhokha Time!'}
                  </span>
                </button>
              ) : (
                <div className="py-3.5 px-4 rounded-2xl bg-white/5 border border-white/10 text-center text-sm text-slate-300 animate-pulse">
                  Waiting for Host to start the round...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Deck Selector & Game Configuration (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Deck Selector */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#10121d] border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-rose-400">
                  Step 1 • Select Mission Deck
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  Current Deck: <span className="text-amber-300">{currentDeck.name}</span>
                </h3>
              </div>
              <span className="text-3xl">{currentDeck.badgeEmoji}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DECKS.map((deck) => {
                const selected = deck.id === settings.deckId;
                return (
                  <button
                    key={deck.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ deckId: deck.id })}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      selected
                        ? 'bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent border-rose-500 shadow-lg shadow-rose-500/10'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/25 opacity-80 hover:opacity-100'
                    } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{deck.badgeEmoji}</span>
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                            selected
                              ? 'bg-rose-500 text-white font-bold'
                              : 'bg-white/10 text-slate-400'
                          }`}
                        >
                          {selected ? 'Active Deck' : `${deck.cards.length} Cards`}
                        </span>
                      </div>
                      <div className="font-bold text-base text-white mt-2">{deck.name}</div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {deck.description}
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300">
                      <span>
                        Impostor Role: <strong className="text-amber-300">{deck.spyTitle}</strong>
                      </span>
                      <span>{deck.cards.length} {deck.cardNoun}s</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Game Configuration Panel */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#10121d] border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base sm:text-lg text-white">
                  Circle Rules & Scaling Configuration
                </h3>
              </div>
              {!isHost && (
                <span className="text-xs text-slate-400 font-mono">Configured by Host</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Round Duration */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-rose-400" />
                    Round Timer
                  </span>
                  <span className="text-sm font-mono font-bold text-amber-300">
                    {durationMinutes} mins
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={15}
                  step={1}
                  disabled={!isHost}
                  value={durationMinutes}
                  onChange={(e) =>
                    updateSettings({ timerDurationSeconds: Number(e.target.value) * 60 })
                  }
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>3m (Blitz)</span>
                  <span>8m (Standard)</span>
                  <span>15m (Large Party)</span>
                </div>
              </div>

              {/* Card Count */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    {currentDeck.cardNoun}s in Matrix
                  </span>
                  <span className="text-sm font-mono font-bold text-emerald-300">
                    {settings.cardCount} / {currentDeck.cards.length}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentDeck.minCards}
                  max={currentDeck.cards.length}
                  step={2}
                  disabled={!isHost}
                  value={settings.cardCount}
                  onChange={(e) => updateSettings({ cardCount: Number(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{currentDeck.minCards} (Easier for Spy)</span>
                  <span>{currentDeck.cards.length} (Full Deck)</span>
                </div>
              </div>

              {/* Multi-Spy Count */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Number of Gaddars (Spies)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: 1, label: '1 Spy' },
                    { val: 2, label: '2 Spies' },
                    { val: 3, label: '3 Spies' },
                    { val: 0, label: 'Auto' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ spyCount: opt.val })}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                        settings.spyCount === opt.val
                          ? 'bg-rose-600 border-rose-400 text-white'
                          : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Co-Spies Know Each Other?</span>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() =>
                      updateSettings({ spiesKnowEachOther: !settings.spiesKnowEachOther })
                    }
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                      settings.spiesKnowEachOther
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {settings.spiesKnowEachOther ? 'Yes (Team)' : 'No (Blind)'}
                  </button>
                </div>
              </div>

              {/* Voting Mode (Fixes Sheep-Voting Loophole #9) */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    {settings.votingMode === 'BLIND_MAJORITY' ? (
                      <EyeOff className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Eye className="w-4 h-4 text-sky-400" />
                    )}
                    Voting Mode
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'BLIND_MAJORITY', label: 'Blind Vote' },
                      { id: 'LIVE_MAJORITY', label: 'Live Tally' },
                      { id: 'UNANIMOUS', label: 'Unanimous' },
                    ] as { id: VotingMode; label: string }[]
                  ).map((vm) => (
                    <button
                      key={vm.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ votingMode: vm.id })}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                        settings.votingMode === vm.id
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {vm.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {settings.votingMode === 'BLIND_MAJORITY'
                    ? 'Hides vote counts until everyone votes—prevents sheep-voting!'
                    : settings.votingMode === 'LIVE_MAJORITY'
                    ? 'Shows live vote tallies as players click.'
                    : 'Requires everyone (except the suspect) to agree.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full p-6 rounded-3xl bg-[#121521] border border-white/15 text-center space-y-4 shadow-2xl"
          >
            <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
              Scan to Join Circle
            </div>
            <div className="text-3xl font-black font-mono tracking-widest text-white">
              {roomId}
            </div>
            <div className="p-3 bg-white rounded-2xl inline-block mx-auto">
              <RoomQrBadge value={shareUrl} code={roomId} size={200} />
            </div>
            <p className="text-xs text-slate-400">
              Point your phone camera at the QR code or enter code <strong>{roomId}</strong>
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 font-bold text-sm text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
