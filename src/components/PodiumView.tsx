import React from 'react';
import { ConfettiCanvas } from './VisualEffects';
import {
  Trophy,
  Medal,
  RotateCcw,
  Sliders,
  LogOut,
  Flame,
  Crown,
  Sparkles,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { AVATARS } from '../data/decks';

export const PodiumView: React.FC = () => {
  const {
    roomState,
    isHost,
    startRound,
    restartNewMatch,
    returnToLobbyKeepScores,
    resetScoresAndReturnToLobby,
    leaveRoom,
  } = useGame();

  if (!roomState) return null;

  const sorted = [...roomState.players].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const winner = top3[0];

  return (
    <div className="min-h-screen bg-[#07080d] text-white flex flex-col relative">
      <ConfettiCanvas />
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-black text-base sm:text-lg">CIRCLE OF SHAQ</span>
              <span className="ml-2 text-xs font-mono text-amber-300">
                {roomState.mode === 'PASS_AND_PLAY'
                  ? '📱 Pass & Play'
                  : `Room #${roomState.roomId}`}
              </span>
            </div>
          </div>

          <button
            onClick={leaveRoom}
            className="px-3.5 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 text-slate-300"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit to Home</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {/* Winner Headline */}
        {winner && (
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>After {roomState.roundNumber} Rounds of Dhokha</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-rose-400 bg-clip-text text-transparent">
              {winner.name} Rules the Circle!
            </h1>
            <p className="text-sm text-slate-400">
              Master of Deduction & Deception with <strong>{winner.score} points</strong>
            </p>
          </div>
        )}

        {/* 3D Podium */}
        <div className="flex items-end justify-center gap-3 sm:gap-6 pt-8 h-64">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="w-28 sm:w-36 flex flex-col items-center">
              <div className="text-3xl mb-1">
                {AVATARS[top3[1].avatarId % AVATARS.length].emoji}
              </div>
              <div className="font-bold text-xs sm:text-sm text-white truncate max-w-full px-1">
                {top3[1].name}
              </div>
              <div className="text-xs font-mono text-slate-400 mb-2">
                {top3[1].score} pts
              </div>
              <div className="w-full h-28 rounded-t-2xl bg-gradient-to-t from-slate-800 to-slate-700 border-t-2 border-slate-400 flex flex-col items-center justify-center">
                <Medal className="w-6 h-6 text-slate-200 mb-1" />
                <span className="text-xl font-black text-slate-200">2nd</span>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {top3[0] && (
            <div className="w-32 sm:w-40 flex flex-col items-center z-10">
              <Crown className="w-7 h-7 text-amber-400 animate-bounce mb-1" />
              <div className="text-4xl mb-1">
                {AVATARS[top3[0].avatarId % AVATARS.length].emoji}
              </div>
              <div className="font-black text-sm sm:text-base text-amber-300 truncate max-w-full px-1">
                {top3[0].name}
              </div>
              <div className="text-xs font-mono text-amber-200 mb-2">
                {top3[0].score} pts
              </div>
              <div className="w-full h-40 rounded-t-2xl bg-gradient-to-t from-rose-900 via-red-700 to-amber-500 border-t-2 border-yellow-300 shadow-xl shadow-rose-600/30 flex flex-col items-center justify-center">
                <Trophy className="w-8 h-8 text-yellow-200 mb-1" />
                <span className="text-2xl font-black text-white">1st</span>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <div className="w-28 sm:w-36 flex flex-col items-center">
              <div className="text-3xl mb-1">
                {AVATARS[top3[2].avatarId % AVATARS.length].emoji}
              </div>
              <div className="font-bold text-xs sm:text-sm text-white truncate max-w-full px-1">
                {top3[2].name}
              </div>
              <div className="text-xs font-mono text-slate-400 mb-2">
                {top3[2].score} pts
              </div>
              <div className="w-full h-20 rounded-t-2xl bg-gradient-to-t from-amber-950 to-amber-800 border-t-2 border-amber-500 flex flex-col items-center justify-center">
                <Medal className="w-5 h-5 text-amber-300 mb-0.5" />
                <span className="text-lg font-black text-amber-200">3rd</span>
              </div>
            </div>
          )}
        </div>

        {/* Full Leaderboard Table */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#10121d] border border-white/10">
          <h3 className="font-bold text-base text-white mb-4">Full Circle Leaderboard</h3>
          <div className="space-y-2">
            {sorted.map((p, idx) => {
              const av = AVATARS[p.avatarId % AVATARS.length];
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-2xl border ${
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-white/[0.03] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-xs font-mono font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <span className="text-xl">{av.emoji}</span>
                    <span className="font-bold text-sm text-white">{p.name}</span>
                  </div>
                  <span className="font-mono font-black text-amber-300">{p.score} pts</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Persistent Party Rematch Buttons (All players stay in the room automatically!) */}
        {isHost ? (
          <div className="space-y-3">
            <div className="text-xs font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl py-2 px-3 text-center">
              ✓ All {roomState.players.length} players are automatically retained — zero re-joining required!
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={restartNewMatch}
                className="py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-black text-sm text-white shadow-xl flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Fresh Game Now (Same {roomState.players.length} Players)</span>
              </button>
              <button
                onClick={startRound}
                className="py-4 px-5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 font-black text-sm text-white shadow-xl flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Continue Match (Round #{roomState.roundNumber + 1})</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={returnToLobbyKeepScores}
                className="py-3.5 px-5 rounded-2xl bg-white/10 hover:bg-white/15 font-bold text-xs text-white flex items-center justify-center gap-2"
              >
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Lobby (Keep Scores & Players)</span>
              </button>
              <button
                onClick={resetScoresAndReturnToLobby}
                className="py-3.5 px-5 rounded-2xl border border-emerald-500/40 hover:bg-emerald-500/15 font-bold text-xs text-emerald-300 flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                <span>Lobby (Reset Scores, Keep Players)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center text-sm text-emerald-200 font-semibold animate-pulse">
            ✓ Stay on this screen! When the Host restarts the game or returns to Lobby, you will automatically stay in Room #{roomState.roomId} without needing to rejoin!
          </div>
        )}
      </main>
    </div>
  );
};
