import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  InternalRoom,
  PublicRoomState,
  PrivateRolePayload,
  RoomSettings,
  createInitialRoom,
  startNewRoundInRoom,
  passQuestionMic,
  initiateVotingPhase,
  castPlayerVote,
  finalizeVotingOutcome,
  triggerMidRoundSpyReveal,
  submitSpyLocationGuess,
  concludeRoundWithScoring,
  toPublicRoomState,
  toPrivateRolePayload,
} from '../engine/gameEngine';
import { getDeckById } from '../data/decks';

const STORAGE_KEY_SESSION = 'circle_of_shaq_session_v1';
const STORAGE_KEY_HOST_ROOM = 'circle_of_shaq_host_room_v1';
const STORAGE_KEY_ROOMS_REGISTRY = 'circle_of_shaq_rooms_registry_v1';

interface StoredSession {
  roomId: string;
  playerId: string;
  secretToken: string;
  playerName: string;
  avatarId: number;
  isHost: boolean;
  mode: 'CLOUD' | 'P2P' | 'PASS_AND_PLAY';
}

interface GameContextValue {
  roomState: PublicRoomState | null;
  myRole: PrivateRolePayload | null;
  myPlayerId: string | null;
  isHost: boolean;
  connectionStatus: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  errorBanner: string | null;
  clearError: () => void;
  getPassAndPlayRole: (playerId: string) => PrivateRolePayload | null;
  addPassAndPlayPlayer: (name: string, avatarId: number) => void;
  removePlayer: (playerId: string) => void;
  createRoom: (hostName: string, avatarId: number, mode?: 'P2P' | 'PASS_AND_PLAY' | 'CLOUD') => Promise<string>;
  joinRoom: (roomId: string, playerName: string, avatarId: number) => Promise<boolean>;
  leaveRoom: () => void;
  updateSettings: (partial: Partial<RoomSettings>) => void;
  updateMyAvatar: (avatarId: number) => void;
  startRound: () => void;
  passMic: (fromPlayerId: string, toTargetId: string) => void;
  callVote: (callerId?: string) => void;
  castVote: (voterId: string, targetId: string) => void;
  forceEndVoting: () => void;
  blowCoverAsSpy: (spyPlayerId?: string) => void;
  submitSpyGuess: (guessedLocation: string, spyPlayerId?: string) => void;
  manualHostOutcome: (outcome: 'SPY_ESCAPED' | 'SPY_CAUGHT' | 'SPY_GUESSED_RIGHT') => void;
  showWinnersPodium: () => void;
  returnToLobbyKeepScores: () => void;
  resetScoresAndReturnToLobby: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(prefix = 'p'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [myRole, setMyRole] = useState<PrivateRolePayload | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR'>('IDLE');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const hostRoomRef = useRef<InternalRoom | null>(null);
  const myPlayerIdRef = useRef<string | null>(null);
  const secretTokenRef = useRef<string>('');
  const bcRef = useRef<BroadcastChannel | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const clearError = useCallback(() => setErrorBanner(null), []);

  // Sync authoritative state from Host to local state, BroadcastChannel, localStorage registry, and optional SSE backend
  const syncHostStateToAll = useCallback(() => {
    const room = hostRoomRef.current;
    if (!room) return;

    const pubState = toPublicRoomState(room);
    setRoomState(pubState);

    if (myPlayerIdRef.current) {
      setMyRole(toPrivateRolePayload(room, myPlayerIdRef.current));
    }

    const rolesByPlayer: Record<string, PrivateRolePayload | null> = {};
    const rolesByToken: Record<string, PrivateRolePayload | null> = {};
    room.players.forEach((p) => {
      const rolePayload = toPrivateRolePayload(room, p.id);
      rolesByPlayer[p.id] = rolePayload;
      rolesByToken[p.secretToken] = rolePayload;
    });

    try {
      sessionStorage.setItem(STORAGE_KEY_HOST_ROOM, JSON.stringify(room));
      localStorage.setItem(
        `${STORAGE_KEY_ROOMS_REGISTRY}_${room.roomId}`,
        JSON.stringify({
          roomState: pubState,
          rolesByPlayer,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore storage quota errors
    }

    // 1. BroadcastChannel for instant multi-tab sync
    if (bcRef.current) {
      bcRef.current.postMessage({
        type: 'BC_STATE_SYNC',
        roomId: room.roomId,
        roomState: pubState,
        rolesByPlayer,
      });
    }

    // 2. Optional Native Backend SSE Sync (/api/rooms/:roomId/sync) if server is running
    fetch(`/api/rooms/${room.roomId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomState: pubState,
        rolesByToken,
        hostToken: secretTokenRef.current,
      }),
    }).catch(() => {
      // Silent fallback when running on static GitHub Pages
    });
  }, []);

  const processHostAction = useCallback(
    (action: any, senderPlayerId?: string) => {
      const room = hostRoomRef.current;
      if (!room) return;

      const actorId = senderPlayerId || action.playerId || myPlayerIdRef.current;
      const actor = room.players.find((p) => p.id === actorId);

      switch (action.type) {
        case 'JOIN_REQUEST': {
          const { playerId, secretToken, playerName, avatarId } = action;
          const existing = room.players.find(
            (p) => p.id === playerId || (secretToken && p.secretToken === secretToken)
          );
          if (existing) {
            existing.isConnected = true;
            if (playerName) existing.name = playerName.trim().slice(0, 24);
            if (typeof avatarId === 'number') existing.avatarId = avatarId;
          } else {
            if (room.players.length >= 24) {
              return;
            }
            const isMidGame = room.status !== 'LOBBY' && room.status !== 'PODIUM';
            room.players.push({
              id: playerId,
              secretToken: secretToken || generateId('tok'),
              name: (playerName || 'Agent').trim().slice(0, 24),
              avatarId: typeof avatarId === 'number' ? avatarId : Math.floor(Math.random() * 16),
              score: 0,
              isHost: false,
              isConnected: true,
              isSpectator: isMidGame,
              timesQuestioned: 0,
              hasUsedAccusation: false,
              hasVoted: false,
              isSpy: false,
              role: isMidGame ? 'Spectator (Joining Next Round)' : '',
              location: null,
              timesWasSpy: 0,
            });
            if (isMidGame) {
              room.logs.unshift({
                id: `log-${Date.now()}-spec`,
                timestamp: Date.now(),
                text: `👀 ${playerName} joined as Spectator and will be dealt into the next round!`,
                type: 'info',
              });
            }
          }
          syncHostStateToAll();
          break;
        }

        case 'UPDATE_AVATAR': {
          if (actor && typeof action.avatarId === 'number') {
            actor.avatarId = action.avatarId;
            syncHostStateToAll();
          }
          break;
        }

        case 'UPDATE_SETTINGS': {
          if (!actor?.isHost) return;
          const partial: Partial<RoomSettings> = action.settings || {};
          room.settings = { ...room.settings, ...partial };
          const deck = getDeckById(room.settings.deckId);
          room.settings.cardCount = Math.min(
            Math.max(deck.minCards, room.settings.cardCount),
            deck.cards.length
          );
          if (room.status === 'LOBBY') {
            room.chosenCards = deck.cards.slice(0, room.settings.cardCount).map((c) => ({
              name: c.name,
              emoji: c.emoji,
              category: c.category,
            }));
          }
          syncHostStateToAll();
          break;
        }

        case 'REMOVE_PLAYER': {
          if (!actor?.isHost) return;
          if (action.targetPlayerId === actor.id) return;
          room.players = room.players.filter((p) => p.id !== action.targetPlayerId);
          syncHostStateToAll();
          break;
        }

        case 'START_ROUND': {
          if (!actor?.isHost) return;
          if (room.players.length < 3) {
            setErrorBanner('Need at least 3 players in the Circle to start a round!');
            return;
          }
          startNewRoundInRoom(room);
          syncHostStateToAll();
          break;
        }

        case 'PASS_MIC': {
          const fromId = action.fromPlayerId || actorId;
          const res = passQuestionMic(room, fromId, action.toTargetId);
          if (!res.ok && res.error) {
            if (actorId === myPlayerIdRef.current) setErrorBanner(res.error);
          } else {
            syncHostStateToAll();
          }
          break;
        }

        case 'CALL_VOTE': {
          const callerId = action.callerId || actorId;
          const reason = action.reason || (actor?.isHost ? 'HOST_ENDED_ROUND' : 'PLAYER_CALLED');
          const res = initiateVotingPhase(room, callerId, reason);
          if (!res.ok && res.error && actorId === myPlayerIdRef.current) {
            setErrorBanner(res.error);
          } else {
            syncHostStateToAll();
          }
          break;
        }

        case 'CAST_VOTE': {
          const voterId = action.voterId || actorId;
          castPlayerVote(room, voterId, action.targetId);
          syncHostStateToAll();
          break;
        }

        case 'FORCE_END_VOTING': {
          if (!actor?.isHost) return;
          finalizeVotingOutcome(room);
          syncHostStateToAll();
          break;
        }

        case 'BLOW_COVER': {
          const spyId = action.spyPlayerId || actorId;
          const res = triggerMidRoundSpyReveal(room, spyId);
          if (!res.ok && res.error && actorId === myPlayerIdRef.current) {
            setErrorBanner(res.error);
          } else {
            syncHostStateToAll();
          }
          break;
        }

        case 'SUBMIT_SPY_GUESS': {
          const spyId = action.spyPlayerId || actorId;
          submitSpyLocationGuess(room, spyId, action.guessedLocation);
          syncHostStateToAll();
          break;
        }

        case 'MANUAL_HOST_OUTCOME': {
          if (!actor?.isHost) return;
          concludeRoundWithScoring(room, action.outcome, null, null);
          syncHostStateToAll();
          break;
        }

        case 'SHOW_PODIUM': {
          if (!actor?.isHost) return;
          room.status = 'PODIUM';
          syncHostStateToAll();
          break;
        }

        case 'RETURN_TO_LOBBY': {
          if (!actor?.isHost) return;
          if (action.resetScores) {
            room.players.forEach((p) => {
              p.score = 0;
              p.timesWasSpy = 0;
            });
            room.roundNumber = 0;
          }
          room.status = 'LOBBY';
          room.roundEndsAt = null;
          room.votingEndsAt = null;
          room.spyGuessEndsAt = null;
          syncHostStateToAll();
          break;
        }
      }
    },
    [syncHostStateToAll]
  );

  // Authoritative Timer Loop on Host (Fixes Loophole #6)
  useEffect(() => {
    const interval = setInterval(() => {
      const room = hostRoomRef.current;
      if (!room) return;
      const now = Date.now();

      if (room.status === 'PLAYING' && room.roundEndsAt && now >= room.roundEndsAt) {
        initiateVotingPhase(room, null, 'TIMER_EXPIRED');
        syncHostStateToAll();
      } else if (room.status === 'VOTING' && room.votingEndsAt && now >= room.votingEndsAt) {
        finalizeVotingOutcome(room);
        syncHostStateToAll();
      } else if (room.status === 'SPY_GUESS' && room.spyGuessEndsAt && now >= room.spyGuessEndsAt) {
        concludeRoundWithScoring(room, 'SPY_CAUGHT', room.spyGuessingPlayerId, null);
        syncHostStateToAll();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [syncHostStateToAll]);

  // Setup BroadcastChannel + SSE Stream
  const setupChannels = useCallback(
    (roomId: string, isHostMode: boolean, secretToken: string) => {
      if (typeof BroadcastChannel !== 'undefined') {
        if (bcRef.current) bcRef.current.close();
        const bc = new BroadcastChannel(`cos_channel_${roomId}`);
        bcRef.current = bc;

        bc.onmessage = (ev) => {
          const data = ev.data;
          if (!data || data.roomId !== roomId) return;

          if (isHostMode && data.type === 'BC_CLIENT_ACTION') {
            processHostAction(data.action, data.senderId);
          } else if (!isHostMode && data.type === 'BC_STATE_SYNC') {
            setRoomState(data.roomState);
            if (myPlayerIdRef.current && data.rolesByPlayer) {
              setMyRole(data.rolesByPlayer[myPlayerIdRef.current] || null);
            }
            setConnectionStatus('CONNECTED');
          }
        };
      }

      // Also connect to optional Node.js SSE stream if running locally or on cloud host
      try {
        if (sseRef.current) sseRef.current.close();
        const es = new EventSource(`/api/rooms/${roomId}/stream?token=${encodeURIComponent(secretToken)}`);
        sseRef.current = es;
        es.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data);
            if (isHostMode && parsed.clientAction) {
              processHostAction(parsed.clientAction.action, parsed.clientAction.senderId);
            } else if (!isHostMode && parsed.roomState) {
              setRoomState(parsed.roomState);
              setMyRole(parsed.privateRole || null);
              setConnectionStatus('CONNECTED');
            }
          } catch {
            // ignore
          }
        };
        es.onerror = () => {
          es.close();
        };
      } catch {
        // ignore when static
      }
    },
    [processHostAction]
  );

  // Restore session on page refresh (F5) automatically! (Fixes Loophole #5)
  useEffect(() => {
    try {
      const rawSession = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (!rawSession) return;
      const saved: StoredSession = JSON.parse(rawSession);
      if (!saved || !saved.roomId || !saved.playerId) return;

      myPlayerIdRef.current = saved.playerId;
      secretTokenRef.current = saved.secretToken;
      setMyPlayerId(saved.playerId);

      if (saved.isHost) {
        const rawHostRoom = sessionStorage.getItem(STORAGE_KEY_HOST_ROOM);
        if (rawHostRoom) {
          const restoredRoom: InternalRoom = JSON.parse(rawHostRoom);
          hostRoomRef.current = restoredRoom;
          setRoomState(toPublicRoomState(restoredRoom));
          setMyRole(toPrivateRolePayload(restoredRoom, saved.playerId));
          setConnectionStatus('CONNECTED');
          setupChannels(restoredRoom.roomId, true, saved.secretToken);
        }
      } else {
        joinRoom(saved.roomId, saved.playerName, saved.avatarId);
      }
    } catch (e) {
      console.error('Session restore failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = useCallback(
    async (
      hostName: string,
      avatarId: number,
      mode: 'P2P' | 'PASS_AND_PLAY' | 'CLOUD' = 'P2P'
    ): Promise<string> => {
      setErrorBanner(null);
      setConnectionStatus('CONNECTED');

      const roomId = generateRoomCode();
      const hostId = generateId('host');
      const secretToken = generateId('tok');

      myPlayerIdRef.current = hostId;
      secretTokenRef.current = secretToken;
      setMyPlayerId(hostId);

      const newRoom = createInitialRoom(roomId, hostName, avatarId, mode, hostId, secretToken);
      hostRoomRef.current = newRoom;

      const sessionObj: StoredSession = {
        roomId,
        playerId: hostId,
        secretToken,
        playerName: hostName,
        avatarId,
        isHost: true,
        mode,
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionObj));

      setupChannels(roomId, true, secretToken);
      syncHostStateToAll();
      return roomId;
    },
    [setupChannels, syncHostStateToAll]
  );

  const joinRoom = useCallback(
    async (rawRoomId: string, playerName: string, avatarId: number): Promise<boolean> => {
      const roomId = rawRoomId.trim().toUpperCase().slice(0, 4);
      if (roomId.length < 4) {
        setErrorBanner('Please enter a valid 4-character Room Code.');
        return false;
      }

      setErrorBanner(null);
      setConnectionStatus('CONNECTING');

      let playerId = myPlayerIdRef.current;
      let secretToken = secretTokenRef.current;
      try {
        const existingRaw = sessionStorage.getItem(STORAGE_KEY_SESSION);
        if (existingRaw) {
          const parsed: StoredSession = JSON.parse(existingRaw);
          if (parsed.roomId === roomId && parsed.playerId) {
            playerId = parsed.playerId;
            secretToken = parsed.secretToken;
          }
        }
      } catch {
        // ignore
      }
      if (!playerId) playerId = generateId('agent');
      if (!secretToken) secretToken = generateId('tok');

      myPlayerIdRef.current = playerId;
      secretTokenRef.current = secretToken;
      setMyPlayerId(playerId);

      const sessionObj: StoredSession = {
        roomId,
        playerId,
        secretToken,
        playerName,
        avatarId,
        isHost: false,
        mode: 'P2P',
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionObj));

      setupChannels(roomId, false, secretToken);

      const joinAction = {
        type: 'JOIN_REQUEST',
        playerId,
        secretToken,
        playerName,
        avatarId,
      };

      // 1. Send via BroadcastChannel
      bcRef.current?.postMessage({
        type: 'BC_CLIENT_ACTION',
        roomId,
        senderId: playerId,
        action: joinAction,
      });

      // 2. Also send via API if server is running
      fetch(`/api/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: playerId, action: joinAction }),
      }).catch(() => {});

      // 3. Check localStorage room registry for instant local hydration
      try {
        const cachedRaw = localStorage.getItem(`${STORAGE_KEY_ROOMS_REGISTRY}_${roomId}`);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached.roomState) {
            setRoomState(cached.roomState);
            setConnectionStatus('CONNECTED');
            return true;
          }
        }
      } catch {
        // ignore
      }

      return new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            setErrorBanner(`Could not find active Circle "${roomId}". Make sure the Host has created it!`);
            setConnectionStatus('ERROR');
            resolve(false);
          }
        }, 3500);

        const prevHandler = bcRef.current ? bcRef.current.onmessage : null;
        if (bcRef.current) {
          bcRef.current.onmessage = (ev) => {
            if (prevHandler) prevHandler.call(bcRef.current!, ev);
            if (ev.data?.type === 'BC_STATE_SYNC' && ev.data?.roomId === roomId && !settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(true);
            }
          };
        }
      });
    },
    [setupChannels]
  );

  const dispatchAction = useCallback(
    (action: any) => {
      if (hostRoomRef.current) {
        processHostAction(action, myPlayerIdRef.current || undefined);
        return;
      }

      if (bcRef.current && roomState?.roomId) {
        bcRef.current.postMessage({
          type: 'BC_CLIENT_ACTION',
          roomId: roomState.roomId,
          senderId: myPlayerIdRef.current,
          action,
        });
      }

      if (roomState?.roomId) {
        fetch(`/api/rooms/${roomState.roomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: myPlayerIdRef.current, action }),
        }).catch(() => {});
      }
    },
    [processHostAction, roomState?.roomId]
  );

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_HOST_ROOM);
    hostRoomRef.current = null;
    if (bcRef.current) {
      bcRef.current.close();
      bcRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setRoomState(null);
    setMyRole(null);
    setMyPlayerId(null);
    setConnectionStatus('IDLE');
  }, []);

  const addPassAndPlayPlayer = useCallback(
    (name: string, avatarId: number) => {
      const room = hostRoomRef.current;
      if (!room) return;
      const cleanName = name.trim().slice(0, 24);
      if (!cleanName) return;
      const pid = generateId('pnp');
      room.players.push({
        id: pid,
        secretToken: generateId('tok'),
        name: cleanName,
        avatarId,
        score: 0,
        isHost: false,
        isConnected: true,
        isSpectator: false,
        timesQuestioned: 0,
        hasUsedAccusation: false,
        hasVoted: false,
        isSpy: false,
        role: '',
        location: null,
        timesWasSpy: 0,
      });
      syncHostStateToAll();
    },
    [syncHostStateToAll]
  );

  const getPassAndPlayRole = useCallback((playerId: string): PrivateRolePayload | null => {
    if (!hostRoomRef.current) return null;
    return toPrivateRolePayload(hostRoomRef.current, playerId);
  }, []);

  const isHost = Boolean(
    roomState?.players.find((p) => p.id === myPlayerId)?.isHost || hostRoomRef.current
  );

  return (
    <GameContext.Provider
      value={{
        roomState,
        myRole,
        myPlayerId,
        isHost,
        connectionStatus,
        errorBanner,
        clearError,
        getPassAndPlayRole,
        addPassAndPlayPlayer,
        removePlayer: (targetPlayerId) =>
          dispatchAction({ type: 'REMOVE_PLAYER', targetPlayerId }),
        createRoom,
        joinRoom,
        leaveRoom,
        updateSettings: (settings) => dispatchAction({ type: 'UPDATE_SETTINGS', settings }),
        updateMyAvatar: (avatarId) => dispatchAction({ type: 'UPDATE_AVATAR', avatarId }),
        startRound: () => dispatchAction({ type: 'START_ROUND' }),
        passMic: (fromPlayerId, toTargetId) =>
          dispatchAction({ type: 'PASS_MIC', fromPlayerId, toTargetId }),
        callVote: (callerId) => dispatchAction({ type: 'CALL_VOTE', callerId }),
        castVote: (voterId, targetId) =>
          dispatchAction({ type: 'CAST_VOTE', voterId, targetId }),
        forceEndVoting: () => dispatchAction({ type: 'FORCE_END_VOTING' }),
        blowCoverAsSpy: (spyPlayerId) =>
          dispatchAction({ type: 'BLOW_COVER', spyPlayerId }),
        submitSpyGuess: (guessedLocation, spyPlayerId) =>
          dispatchAction({ type: 'SUBMIT_SPY_GUESS', guessedLocation, spyPlayerId }),
        manualHostOutcome: (outcome) =>
          dispatchAction({ type: 'MANUAL_HOST_OUTCOME', outcome }),
        showWinnersPodium: () => dispatchAction({ type: 'SHOW_PODIUM' }),
        returnToLobbyKeepScores: () =>
          dispatchAction({ type: 'RETURN_TO_LOBBY', resetScores: false }),
        resetScoresAndReturnToLobby: () =>
          dispatchAction({ type: 'RETURN_TO_LOBBY', resetScores: true }),
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
