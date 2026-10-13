import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
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

const STORAGE_KEY_SESSION = 'circle_of_shaq_session_v2';
const STORAGE_KEY_HOST_ROOM = 'circle_of_shaq_host_room_v2';
const STORAGE_KEY_ROOMS_REGISTRY = 'circle_of_shaq_rooms_registry_v2';

// Unique PeerJS ID namespace so any phone/laptop on the internet can discover the Host's 4-letter Room Code!
const PEER_ROOM_PREFIX = 'circle-of-shaq-v2-room-';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

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

  // Cross-device WebRTC (PeerJS) + Same-device BroadcastChannel refs
  const peerRef = useRef<Peer | null>(null);
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map()); // playerId -> DataConnection (on Host)
  const hostConnRef = useRef<DataConnection | null>(null); // DataConnection to Host (on Guest)
  const bcRef = useRef<BroadcastChannel | null>(null);

  const clearError = useCallback(() => setErrorBanner(null), []);

  /**
   * Broadcasts updated state from the Host to:
   * 1. Host's own React state + sessionStorage
   * 2. All connected remote phones/laptops over WebRTC DataConnections (Zero-Leak: each player ONLY receives their own privateRole!)
   * 3. Same-browser tabs over BroadcastChannel
   */
  const syncHostStateToAll = useCallback(() => {
    const room = hostRoomRef.current;
    if (!room) return;

    const pubState = toPublicRoomState(room);
    setRoomState(pubState);

    if (myPlayerIdRef.current) {
      setMyRole(toPrivateRolePayload(room, myPlayerIdRef.current));
    }

    const rolesByPlayer: Record<string, PrivateRolePayload | null> = {};
    room.players.forEach((p) => {
      rolesByPlayer[p.id] = toPrivateRolePayload(room, p.id);
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

    // Send over WebRTC PeerJS connections to every remote device in the Circle!
    guestConnsRef.current.forEach((conn, pid) => {
      if (conn && conn.open) {
        try {
          conn.send({
            type: 'STATE_SYNC',
            roomState: pubState,
            privateRole: rolesByPlayer[pid] || null,
          });
        } catch (err) {
          console.warn('Failed to send to peer', pid, err);
        }
      }
    });

    // Send over BroadcastChannel for same-device multi-tab testing
    if (bcRef.current) {
      bcRef.current.postMessage({
        type: 'BC_STATE_SYNC',
        roomId: room.roomId,
        roomState: pubState,
        rolesByPlayer,
      });
    }
  }, []);

  /**
   * Authoritative Host Action Processor
   */
  const processHostAction = useCallback(
    (action: any, senderPlayerId?: string, incomingConn?: DataConnection) => {
      const room = hostRoomRef.current;
      if (!room || !action) return;

      const actorId = senderPlayerId || action.playerId || myPlayerIdRef.current;
      const actor = room.players.find((p) => p.id === actorId);

      switch (action.type) {
        case 'JOIN_REQUEST': {
          const { playerId, secretToken, playerName, avatarId } = action;
          if (incomingConn && playerId) {
            guestConnsRef.current.set(playerId, incomingConn);
          }

          const existing = room.players.find(
            (p) => p.id === playerId || (secretToken && p.secretToken === secretToken)
          );
          if (existing) {
            existing.isConnected = true;
            if (playerName) existing.name = playerName.trim().slice(0, 24);
            if (typeof avatarId === 'number') existing.avatarId = avatarId;
            if (incomingConn) {
              guestConnsRef.current.set(existing.id, incomingConn);
            }
          } else {
            if (room.players.length >= 24) {
              if (incomingConn && incomingConn.open) {
                incomingConn.send({
                  type: 'JOIN_REJECTED',
                  error: 'Circle is full (24 players maximum)!',
                });
              }
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
          const targetConn = guestConnsRef.current.get(action.targetPlayerId);
          if (targetConn) {
            targetConn.close();
            guestConnsRef.current.delete(action.targetPlayerId);
          }
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

  // Authoritative Timer Loop on Host
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

  /**
   * Setup Same-Browser BroadcastChannel
   */
  const setupBroadcastChannel = useCallback(
    (roomId: string, isHostMode: boolean) => {
      if (typeof BroadcastChannel === 'undefined') return;
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
    },
    [processHostAction]
  );

  /**
   * Registers the Host's 4-letter Room Code on the global PeerJS WebRTC Signaling Broker
   * so any phone or laptop on Wi-Fi or 5G can join by typing the 4-letter code or scanning the QR!
   */
  const startHostPeerNode = useCallback(
    (roomId: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }

        let resolved = false;
        try {
          const peer = new Peer(`${PEER_ROOM_PREFIX}${roomId}`, {
            config: { iceServers: ICE_SERVERS },
          });
          peerRef.current = peer;

          peer.on('open', () => {
            setConnectionStatus('CONNECTED');
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          });

          peer.on('connection', (conn) => {
            let boundPlayerId: string | null = null;

            conn.on('data', (payload: any) => {
              if (!payload || typeof payload !== 'object') return;
              if (payload.type === 'CLIENT_ACTION' && payload.action) {
                if (payload.action.type === 'JOIN_REQUEST' && payload.action.playerId) {
                  boundPlayerId = payload.action.playerId;
                  guestConnsRef.current.set(boundPlayerId!, conn);
                }
                processHostAction(
                  payload.action,
                  boundPlayerId || payload.senderId,
                  conn
                );
              }
            });

            conn.on('close', () => {
              if (boundPlayerId && hostRoomRef.current) {
                const p = hostRoomRef.current.players.find((pl) => pl.id === boundPlayerId);
                if (p) {
                  p.isConnected = false;
                  syncHostStateToAll();
                }
                guestConnsRef.current.delete(boundPlayerId);
              }
            });
          });

          peer.on('disconnected', () => {
            try {
              peer.reconnect();
            } catch {
              // ignore
            }
          });

          peer.on('error', (err: any) => {
            console.warn('Host PeerJS notice:', err?.type || err);
            setConnectionStatus('CONNECTED');
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              setConnectionStatus('CONNECTED');
              resolve(true);
            }
          }, 3000);
        } catch {
          if (!resolved) {
            resolved = true;
            setConnectionStatus('CONNECTED');
            resolve(false);
          }
        }
      });
    },
    [processHostAction, syncHostStateToAll]
  );

  // Restore session on page refresh (F5) automatically!
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
          setupBroadcastChannel(restoredRoom.roomId, true);
          if (restoredRoom.mode === 'P2P') {
            startHostPeerNode(restoredRoom.roomId);
          }
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
      setConnectionStatus('CONNECTING');

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

      setupBroadcastChannel(roomId, true);
      syncHostStateToAll();

      if (mode === 'P2P') {
        await startHostPeerNode(roomId);
      } else {
        setConnectionStatus('CONNECTED');
      }

      return roomId;
    },
    [setupBroadcastChannel, startHostPeerNode, syncHostStateToAll]
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

      const joinAction = {
        type: 'JOIN_REQUEST',
        playerId,
        secretToken,
        playerName,
        avatarId,
      };

      // 1. Setup BroadcastChannel (instant if joining from another tab on the same device)
      setupBroadcastChannel(roomId, false);
      bcRef.current?.postMessage({
        type: 'BC_CLIENT_ACTION',
        roomId,
        senderId: playerId,
        action: joinAction,
      });

      // 2. Connect across devices via PeerJS WebRTC (works from any phone/laptop on GitHub Pages!)
      return new Promise<boolean>((resolve) => {
        let settled = false;

        const finish = (ok: boolean, errMsg?: string) => {
          if (settled) return;
          settled = true;
          if (errMsg) {
            setErrorBanner(errMsg);
            setConnectionStatus('ERROR');
          }
          resolve(ok);
        };

        // Listen for BroadcastChannel response if on same device
        const prevBcHandler = bcRef.current ? bcRef.current.onmessage : null;
        if (bcRef.current) {
          bcRef.current.onmessage = (ev) => {
            if (prevBcHandler) prevBcHandler.call(bcRef.current!, ev);
            if (ev.data?.type === 'BC_STATE_SYNC' && ev.data?.roomId === roomId) {
              finish(true);
            }
          };
        }

        // Open WebRTC Peer connection to `${PEER_ROOM_PREFIX}${roomId}`
        try {
          if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
          }
          const guestPeer = new Peer({
            config: { iceServers: ICE_SERVERS },
          });
          peerRef.current = guestPeer;

          guestPeer.on('open', () => {
            if (settled) return;
            const conn = guestPeer.connect(`${PEER_ROOM_PREFIX}${roomId}`, {
              reliable: true,
              serialization: 'json',
            });
            hostConnRef.current = conn;

            conn.on('open', () => {
              conn.send({
                type: 'CLIENT_ACTION',
                senderId: playerId,
                action: joinAction,
              });
            });

            conn.on('data', (data: any) => {
              if (!data || typeof data !== 'object') return;
              if (data.type === 'JOIN_REJECTED') {
                finish(false, data.error || 'Could not join Circle.');
                return;
              }
              if (data.type === 'STATE_SYNC' && data.roomState) {
                setRoomState(data.roomState);
                setMyRole(data.privateRole || null);
                setConnectionStatus('CONNECTED');
                finish(true);
              }
            });

            conn.on('close', () => {
              setConnectionStatus('RECONNECTING');
            });

            conn.on('error', () => {
              finish(
                false,
                `Connection to Circle "${roomId}" interrupted. Check that the Host tab is open.`
              );
            });
          });

          guestPeer.on('error', (err: any) => {
            if (err?.type === 'peer-unavailable') {
              finish(
                false,
                `Could not find active Circle "${roomId}". Make sure the Host has created it and kept their tab open!`
              );
            } else {
              finish(false, `Network error (${err?.type || 'webrtc'}) connecting to Circle "${roomId}".`);
            }
          });
        } catch {
          finish(false, `Unable to initialize WebRTC connection for Circle "${roomId}".`);
        }

        // 10-second timeout for mobile cellular handshakes
        setTimeout(() => {
          finish(
            false,
            `Timed out connecting to Circle "${roomId}". Make sure the Host device has the lobby open!`
          );
        }, 10000);
      });
    },
    [setupBroadcastChannel]
  );

  const dispatchAction = useCallback(
    (action: any) => {
      if (hostRoomRef.current) {
        processHostAction(action, myPlayerIdRef.current || undefined);
        return;
      }

      if (hostConnRef.current && hostConnRef.current.open) {
        hostConnRef.current.send({
          type: 'CLIENT_ACTION',
          senderId: myPlayerIdRef.current,
          action,
        });
      }

      if (bcRef.current && roomState?.roomId) {
        bcRef.current.postMessage({
          type: 'BC_CLIENT_ACTION',
          roomId: roomState.roomId,
          senderId: myPlayerIdRef.current,
          action,
        });
      }
    },
    [processHostAction, roomState?.roomId]
  );

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_HOST_ROOM);
    hostRoomRef.current = null;
    if (hostConnRef.current) {
      hostConnRef.current.close();
      hostConnRef.current = null;
    }
    guestConnsRef.current.forEach((c) => c.close());
    guestConnsRef.current.clear();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (bcRef.current) {
      bcRef.current.close();
      bcRef.current = null;
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
