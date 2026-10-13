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
  castPlayerVote,
  finalizeVotingOutcome,
  triggerMidRoundSpyReveal,
  submitSpyLocationGuess,
  concludeRoundWithScoring,
  toPublicRoomState,
  toPrivateRolePayload,
} from '../engine/gameEngine';
import { getDeckById } from '../data/decks';

const STORAGE_KEY_SESSION = 'circle_of_shaq_session_v3';
const STORAGE_KEY_HOST_ROOM = 'circle_of_shaq_host_room_v3';
const STORAGE_KEY_ROOMS_REGISTRY = 'circle_of_shaq_rooms_registry_v3';

// Unique PeerJS ID namespace
const PEER_ROOM_PREFIX = 'circle-of-shaq-v3-room-';

// Multi-Broker Cloud WSS Pub/Sub Mesh (Port 443/8884/8084 — bypasses all NATs, firewalls & 5G CGNAT, supports 24+ players & retained state!)
const CLOUD_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
];

const MQTT_TOPIC_PREFIX = 'circle-of-shaq/v3/room';

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
  const activeRoomIdRef = useRef<string | null>(null);

  // Cloud WSS MQTT Mesh + WebRTC (PeerJS) + BroadcastChannel refs
  const mqttClientsRef = useRef<MqttClient[]>([]);
  const processedActionIdsRef = useRef<Set<string>>(new Set());
  const latestStateSeqRef = useRef<number>(0);
  const knownPresenceMapRef = useRef<Map<string, PresencePayload>>(new Map());
  const kickedPlayerIdsRef = useRef<Set<string>>(new Set());

  const peerRef = useRef<Peer | null>(null);
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const hostConnRef = useRef<DataConnection | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const clearError = useCallback(() => setErrorBanner(null), []);

  /**
   * Merges any newly discovered presence payloads into a PublicRoomState for optimistic Guest rendering
   * (so if 20 players join while the Host's phone screen is briefly locked, every Guest still sees all 20 players immediately!)
   */
  const mergePresenceIntoPublicState = useCallback((baseState: PublicRoomState): PublicRoomState => {
    const mergedPlayers = [...baseState.players];
    knownPresenceMapRef.current.forEach((pres) => {
      if (kickedPlayerIdsRef.current.has(pres.playerId)) return;
      if (!mergedPlayers.some((p) => p.id === pres.playerId)) {
        const isMidGame = baseState.status !== 'LOBBY' && baseState.status !== 'PODIUM';
        mergedPlayers.push({
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
    return {
      ...baseState,
      players: mergedPlayers,
    };
  }, []);

  /**
   * Publishes a payload across all connected Cloud WSS MQTT brokers
   */
  const publishToCloudMesh = useCallback(
    (topic: string, data: any, retain = false) => {
      const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);
      mqttClientsRef.current.forEach((client) => {
        if (client && client.connected) {
          try {
            client.publish(topic, payloadStr, { qos: 1, retain });
          } catch {
            // ignore individual broker error
          }
        }
      });
    },
    []
  );

  /**
   * Broadcasts updated state from the Host to:
   * 1. Host's own React state + sessionStorage
   * 2. Multi-Broker Cloud WSS MQTT Mesh with `retain: true` (works across 24+ mobile & laptop devices on any 5G/Wi-Fi network!)
   *    - Public state -> `circle-of-shaq/v3/room/{roomId}/state` (retained)
   *    - Each player's private role -> `circle-of-shaq/v3/room/{roomId}/role/{playerId}` (retained, zero-leak!)
   * 3. WebRTC PeerJS connections
   * 4. Same-browser BroadcastChannel
   */
  const syncHostStateToAll = useCallback(() => {
    const room = hostRoomRef.current;
    if (!room) return;

    const seq = Date.now();
    latestStateSeqRef.current = seq;

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
          updatedAt: seq,
        })
      );
    } catch {
      // ignore storage quota errors
    }

    // 1. Publish to Cloud WSS MQTT Mesh with `retain: true` so 24+ devices & late joiners get state immediately!
    const stateTopic = `${MQTT_TOPIC_PREFIX}/${room.roomId}/state`;
    publishToCloudMesh(
      stateTopic,
      {
        type: 'CLOUD_STATE_SYNC',
        seq,
        roomId: room.roomId,
        roomState: pubState,
        kickedIds: Array.from(kickedPlayerIdsRef.current),
      },
      true
    );

    // Publish each player's private role to their dedicated topic (Zero-Leak: public state never contains Spy or Location!)
    room.players.forEach((p) => {
      const roleTopic = `${MQTT_TOPIC_PREFIX}/${room.roomId}/role/${p.id}`;
      publishToCloudMesh(
        roleTopic,
        {
          type: 'CLOUD_ROLE_SYNC',
          seq,
          playerId: p.id,
          privateRole: rolesByPlayer[p.id] || null,
        },
        true
      );
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
  }, [publishToCloudMesh]);

  /**
   * Authoritative Host Action Processor
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

      switch (action.type) {
        case 'JOIN_REQUEST': {
          const { playerId, secretToken, playerName, avatarId } = action;
          if (!playerId) return;

          // If this player was previously kicked by Host, only re-admit if they explicitly send a fresh JOIN_REQUEST action
          if (action.isExplicitJoin) {
            kickedPlayerIdsRef.current.delete(playerId);
          } else if (kickedPlayerIdsRef.current.has(playerId)) {
            return;
          }

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
          kickedPlayerIdsRef.current.add(action.targetPlayerId);
          knownPresenceMapRef.current.delete(action.targetPlayerId);
          room.players = room.players.filter((p) => p.id !== action.targetPlayerId);
          // Clear retained presence on Cloud Mesh
          publishToCloudMesh(
            `${MQTT_TOPIC_PREFIX}/${room.roomId}/presence/${action.targetPlayerId}`,
            '',
            true
          );
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
    [publishToCloudMesh, syncHostStateToAll]
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
   * Re-sync immediately when a mobile user unlocks their phone or switches back from WhatsApp/Camera
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

  /**
   * Tears down existing Cloud WSS MQTT connections cleanly
   */
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
   * Connects to the Multi-Broker Cloud WSS Mesh for a given Room Code.
   * - Works across 24+ simultaneous mobile & laptop players on any Wi-Fi or 5G network.
   * - Uses MQTT Retained Messages so room state and player presence survive mobile screen-lock!
   */
  const setupCloudMesh = useCallback(
    (
      roomId: string,
      isHostMode: boolean,
      onGuestReceivedState?: (ok: boolean, errorMsg?: string) => void
    ): Promise<boolean> => {
      cleanupCloudMesh();
      activeRoomIdRef.current = roomId;

      return new Promise((resolve) => {
        let resolvedConnect = false;
        const clients: MqttClient[] = [];

        const stateTopic = `${MQTT_TOPIC_PREFIX}/${roomId}/state`;
        const presenceWildcard = `${MQTT_TOPIC_PREFIX}/${roomId}/presence/+`;
        const actionsTopic = `${MQTT_TOPIC_PREFIX}/${roomId}/actions`;
        const myRoleTopic = myPlayerIdRef.current
          ? `${MQTT_TOPIC_PREFIX}/${roomId}/role/${myPlayerIdRef.current}`
          : null;

        CLOUD_WSS_BROKERS.forEach((brokerUrl) => {
          try {
            const client = mqtt.connect(brokerUrl, {
              keepalive: 30,
              reconnectPeriod: 2000,
              connectTimeout: 6000,
              clean: true,
            });
            clients.push(client);

            client.on('connect', () => {
              if (isHostMode) {
                client.subscribe([presenceWildcard, actionsTopic], { qos: 1 }, () => {
                  // Re-publish current retained state to this broker as soon as connected
                  syncHostStateToAll();
                });
                setConnectionStatus('CONNECTED');
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

            client.on('message', (topic, payloadBuf) => {
              const rawStr = payloadBuf.toString();
              if (!rawStr) return;

              let data: any;
              try {
                data = JSON.parse(rawStr);
              } catch {
                return;
              }
              if (!data || typeof data !== 'object') return;

              // 1. Handle Retained Player Presence (`.../presence/{playerId}`)
              if (topic.includes('/presence/')) {
                const pres = data as PresencePayload;
                if (!pres.playerId) return;

                knownPresenceMapRef.current.set(pres.playerId, pres);

                if (isHostMode && hostRoomRef.current) {
                  // Host automatically registers any player present on the Cloud Mesh!
                  const alreadyInRoom = hostRoomRef.current.players.some(
                    (p) => p.id === pres.playerId
                  );
                  if (!alreadyInRoom && !kickedPlayerIdsRef.current.has(pres.playerId)) {
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
                  } else if (alreadyInRoom) {
                    // Ensure newly connected guest gets latest state
                    syncHostStateToAll();
                  }
                } else if (!isHostMode) {
                  // Optimistically merge into Guest's view so all 20+ players see each other immediately
                  setRoomState((prev) => (prev ? mergePresenceIntoPublicState(prev) : prev));
                }
                return;
              }

              // 2. Handle Retained Room State (`.../state`) on Guest devices
              if (!isHostMode && topic === stateTopic && data.type === 'CLOUD_STATE_SYNC' && data.roomState) {
                if (Array.isArray(data.kickedIds)) {
                  data.kickedIds.forEach((id: string) => kickedPlayerIdsRef.current.add(id));
                }
                if (data.seq && data.seq < latestStateSeqRef.current) {
                  return;
                }
                if (data.seq) latestStateSeqRef.current = data.seq;

                const merged = mergePresenceIntoPublicState(data.roomState);
                setRoomState(merged);
                setConnectionStatus('CONNECTED');
                if (onGuestReceivedState) {
                  onGuestReceivedState(true);
                }
                return;
              }

              // 3. Handle Retained Private Role (`.../role/{myPlayerId}`) on Guest devices
              if (
                !isHostMode &&
                myRoleTopic &&
                topic === myRoleTopic &&
                data.type === 'CLOUD_ROLE_SYNC'
              ) {
                setMyRole(data.privateRole || null);
                return;
              }

              // 4. Handle Client Actions (`.../actions`) on Host device
              if (isHostMode && topic === actionsTopic && data.type === 'CLOUD_CLIENT_ACTION' && data.action) {
                processHostAction(data.action, data.senderId);
              }
            });

            client.on('error', () => {
              // Other brokers in the mesh remain active
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
    [cleanupCloudMesh, mergePresenceIntoPublicState, processHostAction, syncHostStateToAll]
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
          setRoomState(mergePresenceIntoPublicState(data.roomState));
          if (myPlayerIdRef.current && data.rolesByPlayer) {
            setMyRole(data.rolesByPlayer[myPlayerIdRef.current] || null);
          }
          setConnectionStatus('CONNECTED');
        }
      };
    },
    [mergePresenceIntoPublicState, processHostAction]
  );

  /**
   * Optional Secondary Transport: PeerJS WebRTC
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
          setRoomState(toPublicRoomState(restoredRoom));
          setMyRole(toPrivateRolePayload(restoredRoom, saved.playerId));
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
      kickedPlayerIdsRef.current.clear();
      processedActionIdsRef.current.clear();

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
        // Start Cloud WSS Mesh (Primary 24-player transport) + WebRTC PeerNode in parallel
        await Promise.race([
          setupCloudMesh(roomId, true),
          startHostPeerNode(roomId),
        ]);
        // Publish retained state immediately once connected
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
      kickedPlayerIdsRef.current.clear();
      latestStateSeqRef.current = 0;

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

      // 2. Connect via Multi-Broker Cloud WSS Mesh + WebRTC simultaneously!
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

        // Start Cloud WSS Mesh (Primary cross-device transport for 24+ mobile & laptop players)
        setupCloudMesh(roomId, false, (ok, errMsg) => {
          if (ok) {
            // Publish retained presence + explicit join action across all cloud brokers
            publishToCloudMesh(
              `${MQTT_TOPIC_PREFIX}/${roomId}/presence/${playerId}`,
              presencePayload,
              true
            );
            publishToCloudMesh(
              `${MQTT_TOPIC_PREFIX}/${roomId}/actions`,
              {
                type: 'CLOUD_CLIENT_ACTION',
                senderId: playerId,
                action: joinAction,
              },
              false
            );
            finish(true);
          } else if (errMsg) {
            finish(false, errMsg);
          }
        }).then(() => {
          // Even before receiving state, publish our presence & join request so an active Host responds immediately
          publishToCloudMesh(
            `${MQTT_TOPIC_PREFIX}/${roomId}/presence/${playerId}`,
            presencePayload,
            true
          );
          publishToCloudMesh(
            `${MQTT_TOPIC_PREFIX}/${roomId}/actions`,
            {
              type: 'CLOUD_CLIENT_ACTION',
              senderId: playerId,
              action: joinAction,
            },
            false
          );
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
                setRoomState(mergePresenceIntoPublicState(data.roomState));
                setMyRole(data.privateRole || null);
                setConnectionStatus('CONNECTED');
                finish(true);
              }
            });
          });

          guestPeer.on('error', () => {
            // Do NOT fail early on PeerJS error because Cloud WSS Mesh handles NAT/5G/mobile sleep!
          });
        } catch {
          // Ignore WebRTC init error; Cloud WSS Mesh is primary
        }

        // 12-second timeout across all transports
        setTimeout(() => {
          if (!settled) {
            // Clear our speculative retained presence if room didn't exist
            publishToCloudMesh(
              `${MQTT_TOPIC_PREFIX}/${roomId}/presence/${playerId}`,
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
    [mergePresenceIntoPublicState, publishToCloudMesh, setupBroadcastChannel, setupCloudMesh]
  );

  const dispatchAction = useCallback(
    (rawAction: any) => {
      const action = {
        ...rawAction,
        actionId: rawAction.actionId || generateId('act'),
      };

      if (hostRoomRef.current) {
        processHostAction(action, myPlayerIdRef.current || undefined);
        return;
      }

      const activeRoomId = roomState?.roomId || activeRoomIdRef.current;

      // 1. Send over Cloud WSS Mesh (Primary transport)
      if (activeRoomId) {
        publishToCloudMesh(
          `${MQTT_TOPIC_PREFIX}/${activeRoomId}/actions`,
          {
            type: 'CLOUD_CLIENT_ACTION',
            senderId: myPlayerIdRef.current,
            action,
          },
          false
        );
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
    [processHostAction, publishToCloudMesh, roomState?.roomId]
  );

  const leaveRoom = useCallback(() => {
    const activeRoomId = roomState?.roomId || activeRoomIdRef.current;
    const myId = myPlayerIdRef.current;

    // Clear retained presence if Guest leaves
    if (activeRoomId && myId && !hostRoomRef.current) {
      publishToCloudMesh(
        `${MQTT_TOPIC_PREFIX}/${activeRoomId}/presence/${myId}`,
        '',
        true
      );
    }

    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_HOST_ROOM);
    hostRoomRef.current = null;
    activeRoomIdRef.current = null;
    knownPresenceMapRef.current.clear();
    kickedPlayerIdsRef.current.clear();

    cleanupCloudMesh();

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
  }, [cleanupCloudMesh, publishToCloudMesh, roomState?.roomId]);

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
