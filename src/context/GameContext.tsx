import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import mqtt, { MqttClient } from 'mqtt';
import {
  InternalRoom,
  PublicRoomState,
  PrivateRolePayload,
  RoomSettings,
  createInitialRoom,
  startNewRoundInRoom,
  passQuestionMic,
  initiateVotingPhase,
  cancelVotingPhase,
  handlePlayerDeparture,
  castPlayerVote,
  finalizeVotingOutcome,
  triggerMidRoundSpyReveal,
  submitSpyLocationGuess,
  concludeRoundWithScoring,
  toPublicRoomState,
  toPrivateRolePayload,
} from '../engine/gameEngine';
import { getDeckById } from '../data/decks';
import {
  deriveBlindTopicHash,
  encryptPayload,
  decryptPayload,
} from '../utils/crypto';

const STORAGE_KEY_SESSION = 'circle_of_shaq_session';
const STORAGE_KEY_HOST_ROOM = 'circle_of_shaq_host_room';
const STORAGE_KEY_ROOMS_REGISTRY = 'circle_of_shaq_rooms_registry';

const PEER_ROOM_PREFIX = 'circle-of-shaq-room-';

// Redundant Dual-Broker Cloud WSS Pub/Sub Mesh (Port 443/8884/8084 — works across Wi-Fi & 5G/LTE mobile networks, supports 24+ players & retained state)
const CLOUD_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const MQTT_TOPIC_NAMESPACE = 'circle-of-shaq/mesh';

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

interface PresencePayload {
  playerId: string;
  secretToken: string;
  playerName: string;
  avatarId: number;
  joinedAt: number;
  status?: 'ONLINE' | 'LEFT';
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
  cancelVote: () => void;
  castVote: (voterId: string, targetId: string) => void;
  forceEndVoting: () => void;
  blowCoverAsSpy: (spyPlayerId?: string) => void;
  submitSpyGuess: (guessedLocation: string, spyPlayerId?: string) => void;
  manualHostOutcome: (outcome: 'SPY_ESCAPED' | 'SPY_CAUGHT' | 'SPY_GUESSED_RIGHT') => void;
  showWinnersPodium: () => void;
  returnToLobbyKeepScores: () => void;
  resetScoresAndReturnToLobby: () => void;
  restartNewMatch: () => void;
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
  const activeRoomIdRef = useRef<string | null>(null);
  const activeBlindHashRef = useRef<string | null>(null);

  // Cloud WSS MQTT Mesh + WebRTC (PeerJS) + BroadcastChannel refs
  const mqttClientsRef = useRef<MqttClient[]>([]);
  const processedActionIdsRef = useRef<Set<string>>(new Set());
  const latestStateSeqRef = useRef<number>(0);
  const lastRoomHashRef = useRef<string>('');
  const lastRoleHashRef = useRef<string>('');
  const knownPresenceMapRef = useRef<Map<string, PresencePayload>>(new Map());
  const departedOrKickedIdsRef = useRef<Set<string>>(new Set());

  const peerRef = useRef<Peer | null>(null);
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const hostConnRef = useRef<DataConnection | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const clearError = useCallback(() => setErrorBanner(null), []);

  /**
   * Anti-Flicker State Setter: Only triggers a React state update when the room state payload has genuinely changed!
   */
  const updateRoomStateIfChanged = useCallback((nextState: PublicRoomState) => {
    const hash = JSON.stringify(nextState);
    if (hash === lastRoomHashRef.current) return;
    lastRoomHashRef.current = hash;
    setRoomState(nextState);
  }, []);

  const updateMyRoleIfChanged = useCallback((nextRole: PrivateRolePayload | null) => {
    const hash = JSON.stringify(nextRole);
    if (hash === lastRoleHashRef.current) return;
    lastRoleHashRef.current = hash;
    setMyRole(nextRole);
  }, []);

  /**
   * Merges active presence payloads and filters out any departed/kicked players for instant Guest UI updates
   */
  const mergePresenceIntoPublicState = useCallback((baseState: PublicRoomState): PublicRoomState => {
    const filteredPlayers = baseState.players.filter(
      (p) => !departedOrKickedIdsRef.current.has(p.id)
    );
    let changed = filteredPlayers.length !== baseState.players.length;

    knownPresenceMapRef.current.forEach((pres) => {
      if (departedOrKickedIdsRef.current.has(pres.playerId) || pres.status === 'LEFT') return;
      if (!filteredPlayers.some((p) => p.id === pres.playerId)) {
        changed = true;
        const isMidGame = baseState.status !== 'LOBBY' && baseState.status !== 'PODIUM';
        filteredPlayers.push({
          id: pres.playerId,
          name: pres.playerName,
          avatarId: pres.avatarId,
          score: 0,
          isHost: false,
          isConnected: true,
          isSpectator: isMidGame,
          timesQuestioned: 0,
          hasUsedAccusation: false,
          hasVoted: false,
        });
      }
    });

    if (!changed) return baseState;
    return {
      ...baseState,
      players: filteredPlayers,
    };
  }, []);

  /**
   * Publishes a raw string payload across all connected Cloud WSS MQTT brokers
   */
  const publishRawToCloudMesh = useCallback((topic: string, payloadStr: string, retain = false) => {
    mqttClientsRef.current.forEach((client) => {
      if (client && client.connected) {
        try {
          client.publish(topic, payloadStr, { qos: 1, retain });
        } catch {
          // ignore individual broker error
        }
      }
    });
  }, []);

  /**
   * Encrypts a payload with AES-256-GCM and publishes it to the blinded topic on the Cloud WSS Mesh
   */
  const publishEncryptedToCloudMesh = useCallback(
    async (topic: string, data: unknown, encryptionKey: string, retain = false) => {
      try {
        const encryptedEnvelope = await encryptPayload(data, encryptionKey);
        publishRawToCloudMesh(topic, encryptedEnvelope, retain);
      } catch {
        // ignore encryption error
      }
    },
    [publishRawToCloudMesh]
  );

  /**
   * Broadcasts updated state from the Host to all connected devices using AES-256-GCM E2EE
   */
  const syncHostStateToAll = useCallback(() => {
    const room = hostRoomRef.current;
    if (!room) return;

    const seq = latestStateSeqRef.current + 1;
    latestStateSeqRef.current = seq;

    const pubState = toPublicRoomState(room);
    updateRoomStateIfChanged(pubState);

    if (myPlayerIdRef.current) {
      updateMyRoleIfChanged(toPrivateRolePayload(room, myPlayerIdRef.current));
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

    // 1. Encrypt and publish to Blinded Cloud WSS Mesh topics with `retain: true`
    deriveBlindTopicHash(room.roomId).then((blindHash) => {
      activeBlindHashRef.current = blindHash;
      const stateTopic = `${MQTT_TOPIC_NAMESPACE}/${blindHash}/state`;

      publishEncryptedToCloudMesh(
        stateTopic,
        {
          type: 'CLOUD_STATE_SYNC',
          seq,
          roomId: room.roomId,
          roomState: pubState,
          departedIds: Array.from(departedOrKickedIdsRef.current),
        },
        room.roomId,
        true
      );

      // Zero-Trust Private Role Encryption:
      // Each player's private role is encrypted with `${room.roomId}:${p.secretToken}` so NOT EVEN other players in the same room can decrypt someone else's role card!
      room.players.forEach((p) => {
        const roleTopic = `${MQTT_TOPIC_NAMESPACE}/${blindHash}/role/${p.id}`;
        const playerPrivateKey = `${room.roomId}:${p.secretToken}`;
        publishEncryptedToCloudMesh(
          roleTopic,
          {
            type: 'CLOUD_ROLE_SYNC',
            seq,
            playerId: p.id,
            privateRole: rolesByPlayer[p.id] || null,
          },
          playerPrivateKey,
          true
        );
      });
    });

    // 2. Send over WebRTC PeerJS connections
    guestConnsRef.current.forEach((conn, pid) => {
      if (conn && conn.open) {
        try {
          conn.send({
            type: 'STATE_SYNC',
            seq,
            roomState: pubState,
            privateRole: rolesByPlayer[pid] || null,
          });
        } catch {
          // ignore
        }
      }
    });

    // 3. Send over BroadcastChannel for same-device tabs
    if (bcRef.current) {
      bcRef.current.postMessage({
        type: 'BC_STATE_SYNC',
        seq,
        roomId: room.roomId,
        roomState: pubState,
        rolesByPlayer,
      });
    }
  }, [publishEncryptedToCloudMesh, updateMyRoleIfChanged, updateRoomStateIfChanged]);

  /**
   * Authoritative Host Action Processor with Strict `secretToken` Verification
   */
  const processHostAction = useCallback(
    (action: any, senderPlayerId?: string, incomingConn?: DataConnection) => {
      const room = hostRoomRef.current;
      if (!room || !action) return;

      // Deduplicate actions received simultaneously across multiple Cloud WSS brokers + WebRTC
      if (action.actionId) {
        if (processedActionIdsRef.current.has(action.actionId)) {
          return;
        }
        processedActionIdsRef.current.add(action.actionId);
      }

      const actorId = senderPlayerId || action.playerId || myPlayerIdRef.current;
      const actor = room.players.find((p) => p.id === actorId);

      // Verify secretToken for existing non-host players to prevent player-impersonation inside a room
      if (
        actor &&
        actor.id !== myPlayerIdRef.current &&
        action.type !== 'JOIN_REQUEST' &&
        action.secretToken &&
        actor.secretToken &&
        action.secretToken !== actor.secretToken
      ) {
        return;
      }

      switch (action.type) {
        case 'JOIN_REQUEST': {
          const { playerId, secretToken, playerName, avatarId } = action;
          if (!playerId) return;

          if (action.isExplicitJoin) {
            departedOrKickedIdsRef.current.delete(playerId);
          } else if (departedOrKickedIdsRef.current.has(playerId)) {
            return;
          }

          if (incomingConn && playerId) {
            guestConnsRef.current.set(playerId, incomingConn);
          }

          const existing = room.players.find(
            (p) => p.id === playerId || (secretToken && p.secretToken === secretToken)
          );
          if (existing) {
            let changed = false;
            if (!existing.isConnected) {
              existing.isConnected = true;
              changed = true;
            }
            if (secretToken && existing.secretToken !== secretToken) {
              existing.secretToken = secretToken;
              changed = true;
            }
            const cleanName = playerName ? playerName.trim().slice(0, 24) : existing.name;
            if (cleanName && existing.name !== cleanName) {
              existing.name = cleanName;
              changed = true;
            }
            if (typeof avatarId === 'number' && existing.avatarId !== avatarId) {
              existing.avatarId = avatarId;
              changed = true;
            }
            if (incomingConn) {
              guestConnsRef.current.set(existing.id, incomingConn);
            }
            if (changed) {
              syncHostStateToAll();
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
            syncHostStateToAll();
          }
          break;
        }

        case 'PLAYER_LEFT': {
          const targetId = action.playerId || actorId;
          if (!targetId) return;
          departedOrKickedIdsRef.current.add(targetId);
          knownPresenceMapRef.current.delete(targetId);
          if (activeBlindHashRef.current) {
            publishRawToCloudMesh(
              `${MQTT_TOPIC_NAMESPACE}/${activeBlindHashRef.current}/presence/${targetId}`,
              '',
              true
            );
          }
          const conn = guestConnsRef.current.get(targetId);
          if (conn) {
            conn.close();
            guestConnsRef.current.delete(targetId);
          }
          if (handlePlayerDeparture(room, targetId)) {
            syncHostStateToAll();
          }
          break;
        }

        case 'REMOVE_PLAYER': {
          if (!actor?.isHost) return;
          if (action.targetPlayerId === actor.id) return;
          const targetId = action.targetPlayerId;
          departedOrKickedIdsRef.current.add(targetId);
          knownPresenceMapRef.current.delete(targetId);
          if (activeBlindHashRef.current) {
            publishRawToCloudMesh(
              `${MQTT_TOPIC_NAMESPACE}/${activeBlindHashRef.current}/presence/${targetId}`,
              '',
              true
            );
          }
          const targetConn = guestConnsRef.current.get(targetId);
          if (targetConn) {
            targetConn.close();
            guestConnsRef.current.delete(targetId);
          }
          if (handlePlayerDeparture(room, targetId)) {
            syncHostStateToAll();
          }
          break;
        }

        case 'UPDATE_AVATAR': {
          if (actor && typeof action.avatarId === 'number' && actor.avatarId !== action.avatarId) {
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

        case 'START_ROUND': {
          if (!actor?.isHost) return;
          // Automatically ensure any connected player on the mesh is in the room roster before dealing cards
          knownPresenceMapRef.current.forEach((pres) => {
            if (departedOrKickedIdsRef.current.has(pres.playerId) || pres.status === 'LEFT') return;
            if (!room.players.some((p) => p.id === pres.playerId) && room.players.length < 24) {
              room.players.push({
                id: pres.playerId,
                secretToken: pres.secretToken || generateId('tok'),
                name: (pres.playerName || 'Agent').trim().slice(0, 24),
                avatarId: typeof pres.avatarId === 'number' ? pres.avatarId : 0,
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
            }
          });
          if (room.players.length < 3) {
            setErrorBanner('Need at least 3 players in the Circle to start a round!');
            return;
          }
          startNewRoundInRoom(room);
          syncHostStateToAll();
          break;
        }

        case 'RESTART_NEW_MATCH': {
          if (!actor?.isHost) return;
          // Automatically retain all existing players AND pull in any waiting online presence players without asking anyone to re-join
          knownPresenceMapRef.current.forEach((pres) => {
            if (departedOrKickedIdsRef.current.has(pres.playerId) || pres.status === 'LEFT') return;
            if (!room.players.some((p) => p.id === pres.playerId) && room.players.length < 24) {
              room.players.push({
                id: pres.playerId,
                secretToken: pres.secretToken || generateId('tok'),
                name: (pres.playerName || 'Agent').trim().slice(0, 24),
                avatarId: typeof pres.avatarId === 'number' ? pres.avatarId : 0,
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
            }
          });
          if (room.players.length < 3) {
            setErrorBanner('Need at least 3 players in the Circle to start a match!');
            return;
          }
          room.players.forEach((p) => {
            p.score = 0;
            p.timesWasSpy = 0;
            p.isSpectator = false;
            p.isConnected = true;
          });
          room.roundNumber = 0;
          room.previousLocations = [];
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

        case 'CANCEL_VOTE': {
          cancelVotingPhase(room);
          syncHostStateToAll();
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
          // Automatically ensure any waiting online presence players are added into the Lobby roster
          knownPresenceMapRef.current.forEach((pres) => {
            if (departedOrKickedIdsRef.current.has(pres.playerId) || pres.status === 'LEFT') return;
            if (!room.players.some((p) => p.id === pres.playerId) && room.players.length < 24) {
              room.players.push({
                id: pres.playerId,
                secretToken: pres.secretToken || generateId('tok'),
                name: (pres.playerName || 'Agent').trim().slice(0, 24),
                avatarId: typeof pres.avatarId === 'number' ? pres.avatarId : 0,
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
            }
          });
          room.players.forEach((p) => {
            p.isSpectator = false;
            if (action.resetScores) {
              p.score = 0;
              p.timesWasSpy = 0;
            }
          });
          if (action.resetScores) {
            room.roundNumber = 0;
            room.previousLocations = [];
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
    [publishRawToCloudMesh, syncHostStateToAll]
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
   * Re-sync when mobile user unlocks phone or switches back from WhatsApp/Camera
   */
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (hostRoomRef.current) {
          syncHostStateToAll();
        }
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [syncHostStateToAll]);

  const cleanupCloudMesh = useCallback(() => {
    mqttClientsRef.current.forEach((client) => {
      try {
        client.end(true);
      } catch {
        // ignore
      }
    });
    mqttClientsRef.current = [];
  }, []);

  /**
   * Connects to the Multi-Broker Cloud WSS Mesh using SHA-256 Blind Topic Routing & AES-256-GCM E2EE.
   */
  const setupCloudMesh = useCallback(
    async (
      roomId: string,
      isHostMode: boolean,
      onGuestReceivedState?: (ok: boolean, errorMsg?: string) => void
    ): Promise<boolean> => {
      cleanupCloudMesh();
      activeRoomIdRef.current = roomId;

      const blindHash = await deriveBlindTopicHash(roomId);
      activeBlindHashRef.current = blindHash;

      return new Promise((resolve) => {
        let resolvedConnect = false;
        const clients: MqttClient[] = [];

        const stateTopic = `${MQTT_TOPIC_NAMESPACE}/${blindHash}/state`;
        const presenceWildcard = `${MQTT_TOPIC_NAMESPACE}/${blindHash}/presence/+`;
        const actionsTopic = `${MQTT_TOPIC_NAMESPACE}/${blindHash}/actions`;
        const myId = myPlayerIdRef.current;
        const myRoleTopic = myId ? `${MQTT_TOPIC_NAMESPACE}/${blindHash}/role/${myId}` : null;

        CLOUD_WSS_BROKERS.forEach((brokerUrl) => {
          try {
            const client = mqtt.connect(brokerUrl, {
              keepalive: 20,
              reconnectPeriod: 2500,
              connectTimeout: 6000,
              clean: true,
              will:
                !isHostMode && myId
                  ? {
                      topic: `${MQTT_TOPIC_NAMESPACE}/${blindHash}/presence/${myId}`,
                      payload: '',
                      qos: 1,
                      retain: true,
                    }
                  : undefined,
            });
            clients.push(client);

            client.on('connect', () => {
              if (isHostMode) {
                client.subscribe([presenceWildcard, actionsTopic], { qos: 1 }, () => {
                  syncHostStateToAll();
                });
                setConnectionStatus((prev) => (prev === 'CONNECTED' ? prev : 'CONNECTED'));
                if (!resolvedConnect) {
                  resolvedConnect = true;
                  resolve(true);
                }
              } else {
                const subs = [stateTopic, presenceWildcard];
                if (myRoleTopic) subs.push(myRoleTopic);
                client.subscribe(subs, { qos: 1 });
                if (!resolvedConnect) {
                  resolvedConnect = true;
                  resolve(true);
                }
              }
            });

            client.on('message', async (topic, payloadBuf) => {
              const rawStr = payloadBuf.toString();

              // 1. Handle Player Presence & Automatic Departure (`.../presence/{playerId}`)
              if (topic.includes('/presence/')) {
                const topicParts = topic.split('/presence/');
                const topicPlayerId = topicParts[1];
                if (!topicPlayerId) return;

                // Empty payload (from leaveRoom or MQTT Last Will on tab close) means the player left!
                if (!rawStr || rawStr.trim() === '') {
                  knownPresenceMapRef.current.delete(topicPlayerId);
                  departedOrKickedIdsRef.current.add(topicPlayerId);

                  if (isHostMode && hostRoomRef.current) {
                    if (handlePlayerDeparture(hostRoomRef.current, topicPlayerId)) {
                      syncHostStateToAll();
                    }
                  } else if (!isHostMode) {
                    setRoomState((prev) => {
                      if (!prev) return prev;
                      const next = mergePresenceIntoPublicState(prev);
                      const hash = JSON.stringify(next);
                      if (hash === lastRoomHashRef.current) return prev;
                      lastRoomHashRef.current = hash;
                      return next;
                    });
                  }
                  return;
                }

                // Decrypt AES-256-GCM Presence Payload using `roomId`
                const pres = await decryptPayload<PresencePayload>(rawStr, roomId);
                if (!pres || !pres.playerId) return;

                if (pres.status === 'LEFT') {
                  knownPresenceMapRef.current.delete(pres.playerId);
                  departedOrKickedIdsRef.current.add(pres.playerId);
                  if (isHostMode && hostRoomRef.current) {
                    if (handlePlayerDeparture(hostRoomRef.current, pres.playerId)) {
                      syncHostStateToAll();
                    }
                  }
                  return;
                }

                const prevPres = knownPresenceMapRef.current.get(pres.playerId);
                knownPresenceMapRef.current.set(pres.playerId, pres);

                if (isHostMode && hostRoomRef.current) {
                  const alreadyInRoom = hostRoomRef.current.players.some(
                    (p) => p.id === pres.playerId
                  );
                  if (!alreadyInRoom && !departedOrKickedIdsRef.current.has(pres.playerId)) {
                    processHostAction(
                      {
                        type: 'JOIN_REQUEST',
                        playerId: pres.playerId,
                        secretToken: pres.secretToken,
                        playerName: pres.playerName,
                        avatarId: pres.avatarId,
                      },
                      pres.playerId
                    );
                  }
                } else if (!isHostMode && !prevPres) {
                  setRoomState((prev) => {
                    if (!prev) return prev;
                    const merged = mergePresenceIntoPublicState(prev);
                    const hash = JSON.stringify(merged);
                    if (hash === lastRoomHashRef.current) return prev;
                    lastRoomHashRef.current = hash;
                    return merged;
                  });
                }
                return;
              }

              if (!rawStr) return;

              // 2. Handle Encrypted Retained Private Role (`.../role/{myPlayerId}`) on Guest devices
              // Decrypted using `${roomId}:${secretToken}` so ONLY this specific player can decrypt their role!
              if (!isHostMode && myRoleTopic && topic === myRoleTopic) {
                const myPrivateKey = `${roomId}:${secretTokenRef.current}`;
                const roleData = await decryptPayload(rawStr, myPrivateKey);
                if (roleData && roleData.type === 'CLOUD_ROLE_SYNC') {
                  updateMyRoleIfChanged(roleData.privateRole || null);
                }
                return;
              }

              // 3. Decrypt Room-Level Payloads (`.../state` or `.../actions`) using `roomId`
              const data = await decryptPayload(rawStr, roomId);
              if (!data || typeof data !== 'object') return;

              if (!isHostMode && topic === stateTopic && data.type === 'CLOUD_STATE_SYNC' && data.roomState) {
                if (Array.isArray(data.departedIds)) {
                  data.departedIds.forEach((id: string) => {
                    departedOrKickedIdsRef.current.add(id);
                    knownPresenceMapRef.current.delete(id);
                  });
                }

                const merged = mergePresenceIntoPublicState(data.roomState);
                updateRoomStateIfChanged(merged);
                setConnectionStatus((prev) => (prev === 'CONNECTED' ? prev : 'CONNECTED'));
                if (onGuestReceivedState) {
                  onGuestReceivedState(true);
                }
                return;
              }

              // 4. Handle Encrypted Client Actions (`.../actions`) on Host device
              if (isHostMode && topic === actionsTopic && data.type === 'CLOUD_CLIENT_ACTION' && data.action) {
                processHostAction(data.action, data.senderId);
              }
            });

            client.on('error', () => {
              // Other broker in mesh stays active
            });
          } catch {
            // ignore broker init error
          }
        });

        mqttClientsRef.current = clients;

        setTimeout(() => {
          if (!resolvedConnect) {
            resolvedConnect = true;
            resolve(false);
          }
        }, 4000);
      });
    },
    [cleanupCloudMesh, mergePresenceIntoPublicState, processHostAction, syncHostStateToAll, updateMyRoleIfChanged, updateRoomStateIfChanged]
  );

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
          updateRoomStateIfChanged(mergePresenceIntoPublicState(data.roomState));
          if (myPlayerIdRef.current && data.rolesByPlayer) {
            updateMyRoleIfChanged(data.rolesByPlayer[myPlayerIdRef.current] || null);
          }
          setConnectionStatus((prev) => (prev === 'CONNECTED' ? prev : 'CONNECTED'));
        }
      };
    },
    [mergePresenceIntoPublicState, processHostAction, updateMyRoleIfChanged, updateRoomStateIfChanged]
  );

  /**
   * Secondary Transport: PeerJS WebRTC (Uses SHA-256 Blinded Peer ID so Room Code is never exposed on PeerJS broker)
   */
  const startHostPeerNode = useCallback(
    async (roomId: string): Promise<boolean> => {
      const blindHash = await deriveBlindTopicHash(roomId);
      return new Promise((resolve) => {
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }

        let resolved = false;
        try {
          const peer = new Peer(`${PEER_ROOM_PREFIX}${blindHash.slice(0, 16)}`, {
            config: { iceServers: ICE_SERVERS },
          });
          peerRef.current = peer;

          peer.on('open', () => {
            setConnectionStatus((prev) => (prev === 'CONNECTED' ? prev : 'CONNECTED'));
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
              if (boundPlayerId) {
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

          peer.on('error', () => {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          }, 2500);
        } catch {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }
      });
    },
    [processHostAction]
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
          updateRoomStateIfChanged(toPublicRoomState(restoredRoom));
          updateMyRoleIfChanged(toPrivateRolePayload(restoredRoom, saved.playerId));
          setConnectionStatus('CONNECTED');
          setupBroadcastChannel(restoredRoom.roomId, true);
          if (restoredRoom.mode !== 'PASS_AND_PLAY') {
            setupCloudMesh(restoredRoom.roomId, true);
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
      knownPresenceMapRef.current.clear();
      departedOrKickedIdsRef.current.clear();
      processedActionIdsRef.current.clear();
      lastRoomHashRef.current = '';
      lastRoleHashRef.current = '';

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

      if (mode !== 'PASS_AND_PLAY') {
        await Promise.race([
          setupCloudMesh(roomId, true),
          startHostPeerNode(roomId),
        ]);
        syncHostStateToAll();
        setConnectionStatus('CONNECTED');
      } else {
        setConnectionStatus('CONNECTED');
      }

      return roomId;
    },
    [setupBroadcastChannel, setupCloudMesh, startHostPeerNode, syncHostStateToAll]
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
      knownPresenceMapRef.current.clear();
      departedOrKickedIdsRef.current.clear();
      latestStateSeqRef.current = 0;
      lastRoomHashRef.current = '';
      lastRoleHashRef.current = '';

      let playerId = myPlayerIdRef.current;
      let secretToken = secretTokenRef.current;
      try {
        const existingRaw = sessionStorage.getItem(STORAGE_KEY_SESSION);
        if (existingRaw) {
          const parsed: StoredSession = JSON.parse(existingRaw);
          if (parsed.roomId === roomId && parsed.playerId && !parsed.isHost) {
            playerId = parsed.playerId;
            secretToken = parsed.secretToken;
          } else {
            playerId = null;
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

      const cleanName = (playerName || 'Agent').trim().slice(0, 24);

      const sessionObj: StoredSession = {
        roomId,
        playerId,
        secretToken,
        playerName: cleanName,
        avatarId,
        isHost: false,
        mode: 'P2P',
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionObj));

      const blindHash = await deriveBlindTopicHash(roomId);
      activeBlindHashRef.current = blindHash;

      const joinAction = {
        actionId: generateId('act'),
        type: 'JOIN_REQUEST',
        playerId,
        secretToken,
        playerName: cleanName,
        avatarId,
        isExplicitJoin: true,
      };

      const presencePayload: PresencePayload = {
        playerId,
        secretToken,
        playerName: cleanName,
        avatarId,
        joinedAt: Date.now(),
        status: 'ONLINE',
      };
      knownPresenceMapRef.current.set(playerId, presencePayload);

      // 1. Setup BroadcastChannel (instant if on same device)
      setupBroadcastChannel(roomId, false);
      bcRef.current?.postMessage({
        type: 'BC_CLIENT_ACTION',
        roomId,
        senderId: playerId,
        action: joinAction,
      });

      // 2. Connect via Encrypted Multi-Broker Cloud WSS Mesh + WebRTC simultaneously!
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let announcedJoinOnCloud = false;

        const finish = (ok: boolean, errMsg?: string) => {
          if (settled) return;
          settled = true;
          if (errMsg) {
            setErrorBanner(errMsg);
            setConnectionStatus('ERROR');
          }
          resolve(ok);
        };

        const announceJoinOnce = () => {
          if (announcedJoinOnCloud) return;
          announcedJoinOnCloud = true;
          publishEncryptedToCloudMesh(
            `${MQTT_TOPIC_NAMESPACE}/${blindHash}/presence/${playerId}`,
            presencePayload,
            roomId,
            true
          );
          publishEncryptedToCloudMesh(
            `${MQTT_TOPIC_NAMESPACE}/${blindHash}/actions`,
            {
              type: 'CLOUD_CLIENT_ACTION',
              senderId: playerId,
              action: joinAction,
            },
            roomId,
            false
          );
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

        // Start Cloud WSS Mesh (Primary cross-network transport for Wi-Fi + 5G/LTE Mobile)
        setupCloudMesh(roomId, false, (ok, errMsg) => {
          if (ok) {
            announceJoinOnce();
            finish(true);
          } else if (errMsg) {
            finish(false, errMsg);
          }
        }).then(() => {
          announceJoinOnce();
        });

        // Also open WebRTC Peer connection in parallel as secondary fast-path
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
            const conn = guestPeer.connect(`${PEER_ROOM_PREFIX}${blindHash.slice(0, 16)}`, {
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
                updateRoomStateIfChanged(mergePresenceIntoPublicState(data.roomState));
                updateMyRoleIfChanged(data.privateRole || null);
                setConnectionStatus((prev) => (prev === 'CONNECTED' ? prev : 'CONNECTED'));
                finish(true);
              }
            });
          });

          guestPeer.on('error', () => {
            // Cloud WSS Mesh handles NAT/5G/mobile sleep
          });
        } catch {
          // Ignore WebRTC init error
        }

        // 12-second timeout across all transports
        setTimeout(() => {
          if (!settled) {
            publishRawToCloudMesh(
              `${MQTT_TOPIC_NAMESPACE}/${blindHash}/presence/${playerId}`,
              '',
              true
            );
            finish(
              false,
              `Could not find active Circle "${roomId}". Double-check the 4-letter Room Code with the Host!`
            );
          }
        }, 12000);
      });
    },
    [mergePresenceIntoPublicState, publishEncryptedToCloudMesh, publishRawToCloudMesh, setupBroadcastChannel, setupCloudMesh, updateMyRoleIfChanged, updateRoomStateIfChanged]
  );

  const dispatchAction = useCallback(
    (rawAction: any) => {
      const action = {
        ...rawAction,
        actionId: rawAction.actionId || generateId('act'),
        secretToken: secretTokenRef.current,
      };

      if (hostRoomRef.current) {
        processHostAction(action, myPlayerIdRef.current || undefined);
        return;
      }

      const activeRoomId = roomState?.roomId || activeRoomIdRef.current;

      // 1. Encrypt and send over Cloud WSS Mesh (Primary transport)
      if (activeRoomId) {
        deriveBlindTopicHash(activeRoomId).then((blindHash) => {
          publishEncryptedToCloudMesh(
            `${MQTT_TOPIC_NAMESPACE}/${blindHash}/actions`,
            {
              type: 'CLOUD_CLIENT_ACTION',
              senderId: myPlayerIdRef.current,
              action,
            },
            activeRoomId,
            false
          );
        });
      }

      // 2. Send over WebRTC if open
      if (hostConnRef.current && hostConnRef.current.open) {
        try {
          hostConnRef.current.send({
            type: 'CLIENT_ACTION',
            senderId: myPlayerIdRef.current,
            action,
          });
        } catch {
          // ignore
        }
      }

      // 3. Send over BroadcastChannel
      if (bcRef.current && activeRoomId) {
        bcRef.current.postMessage({
          type: 'BC_CLIENT_ACTION',
          roomId: activeRoomId,
          senderId: myPlayerIdRef.current,
          action,
        });
      }
    },
    [processHostAction, publishEncryptedToCloudMesh, roomState?.roomId]
  );

  const leaveRoom = useCallback(() => {
    const activeRoomId = roomState?.roomId || activeRoomIdRef.current;
    const blindHash = activeBlindHashRef.current;
    const myId = myPlayerIdRef.current;

    if (activeRoomId && myId && !hostRoomRef.current) {
      const leaveAction = {
        actionId: generateId('act'),
        type: 'PLAYER_LEFT',
        playerId: myId,
        secretToken: secretTokenRef.current,
      };

      if (blindHash) {
        // 1. Clear retained presence on Cloud WSS Mesh
        publishRawToCloudMesh(
          `${MQTT_TOPIC_NAMESPACE}/${blindHash}/presence/${myId}`,
          '',
          true
        );

        // 2. Broadcast encrypted PLAYER_LEFT action across Cloud Mesh
        publishEncryptedToCloudMesh(
          `${MQTT_TOPIC_NAMESPACE}/${blindHash}/actions`,
          {
            type: 'CLOUD_CLIENT_ACTION',
            senderId: myId,
            action: leaveAction,
          },
          activeRoomId,
          false
        );
      }

      if (hostConnRef.current && hostConnRef.current.open) {
        try {
          hostConnRef.current.send({
            type: 'CLIENT_ACTION',
            senderId: myId,
            action: leaveAction,
          });
        } catch {
          // ignore
        }
      }

      if (bcRef.current) {
        bcRef.current.postMessage({
          type: 'BC_CLIENT_ACTION',
          roomId: activeRoomId,
          senderId: myId,
          action: leaveAction,
        });
      }
    }

    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_HOST_ROOM);
    hostRoomRef.current = null;
    activeRoomIdRef.current = null;
    activeBlindHashRef.current = null;
    knownPresenceMapRef.current.clear();
    departedOrKickedIdsRef.current.clear();
    lastRoomHashRef.current = '';
    lastRoleHashRef.current = '';

    setTimeout(() => {
      cleanupCloudMesh();
    }, 150);

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
  }, [cleanupCloudMesh, publishEncryptedToCloudMesh, publishRawToCloudMesh, roomState?.roomId]);

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
        callVote: (callerId) =>
          dispatchAction({
            type: 'CALL_VOTE',
            callerId: callerId || myPlayerIdRef.current || undefined,
            reason: 'PLAYER_CALLED',
          }),
        cancelVote: () => dispatchAction({ type: 'CANCEL_VOTE' }),
        castVote: (voterId, targetId) =>
          dispatchAction({ type: 'CAST_VOTE', voterId, targetId }),
        forceEndVoting: () => dispatchAction({ type: 'FORCE_END_VOTING' }),
        blowCoverAsSpy: (spyPlayerId) =>
          dispatchAction({
            type: 'BLOW_COVER',
            spyPlayerId: spyPlayerId || myPlayerIdRef.current || undefined,
          }),
        submitSpyGuess: (guessedLocation, spyPlayerId) =>
          dispatchAction({
            type: 'SUBMIT_SPY_GUESS',
            guessedLocation,
            spyPlayerId: spyPlayerId || myPlayerIdRef.current || undefined,
          }),
        manualHostOutcome: (outcome) =>
          dispatchAction({ type: 'MANUAL_HOST_OUTCOME', outcome }),
        showWinnersPodium: () => dispatchAction({ type: 'SHOW_PODIUM' }),
        returnToLobbyKeepScores: () =>
          dispatchAction({ type: 'RETURN_TO_LOBBY', resetScores: false }),
        resetScoresAndReturnToLobby: () =>
          dispatchAction({ type: 'RETURN_TO_LOBBY', resetScores: true }),
        restartNewMatch: () => dispatchAction({ type: 'RESTART_NEW_MATCH' }),
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
