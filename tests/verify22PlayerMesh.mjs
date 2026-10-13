import mqtt from 'mqtt';
import crypto from 'node:crypto';

const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const ROOM_ID = 'TS' + Math.floor(10 + Math.random() * 89);
const APP_CRYPTO_DOMAIN = 'circle-of-shaq-enterprise-e2ee-domain';

const blindHash = crypto
  .createHash('sha256')
  .update(`${APP_CRYPTO_DOMAIN}:topic:${ROOM_ID}`)
  .digest('hex')
  .slice(0, 32);

const PREFIX = `circle-of-shaq/mesh/${blindHash}`;
const TOTAL_GUESTS = 21; // 1 Host + 21 Guests = 22 Players!

console.log(`🚀 Starting 22-Device Encrypted Cloud Mesh Simulation for Room "${ROOM_ID}" (Blind Topic: ${blindHash.slice(0, 12)}...)...`);

const hostPlayers = [
  { id: 'host-1', name: 'Host_Mobile', avatarId: 0, isHost: true },
];

const hostClient = mqtt.connect(BROKER);

function publishHostState() {
  const statePayload = JSON.stringify({
    type: 'CLOUD_STATE_SYNC',
    seq: Date.now(),
    roomId: ROOM_ID,
    roomState: {
      roomId: ROOM_ID,
      status: 'LOBBY',
      players: hostPlayers,
    },
    departedIds: [],
  });

  if (hostClient.connected) {
    hostClient.publish(`${PREFIX}/state`, statePayload, { qos: 1, retain: true });
  }
}

hostClient.on('connect', () => {
  hostClient.subscribe([`${PREFIX}/presence/+`, `${PREFIX}/actions`], { qos: 1 }, () => {
    publishHostState();
    spawnGuests();
  });
});

hostClient.on('message', (topic, buf) => {
  const str = buf.toString();
  if (!str) return;
  const data = JSON.parse(str);
  if (topic.includes('/presence/') && data.playerId) {
    if (!hostPlayers.some((p) => p.id === data.playerId)) {
      hostPlayers.push({
        id: data.playerId,
        name: data.playerName,
        avatarId: data.avatarId,
        isHost: false,
      });
      publishHostState();
    }
  }
});

async function spawnGuests() {
  console.log(`✅ Host online. Spawning ${TOTAL_GUESTS} simultaneous Guest devices (Phones & Laptops)...`);

  const guestClients = [];
  const guestPromises = Array.from({ length: TOTAL_GUESTS }, (_, i) => {
    const playerId = `guest-${i + 1}`;
    const playerName = i % 2 === 0 ? `Phone_${i + 1}` : `Laptop_${i + 1}`;

    return new Promise((resolve, reject) => {
      const gClient = mqtt.connect(BROKER);
      guestClients.push(gClient);
      let joined = false;

      gClient.on('connect', () => {
        gClient.subscribe([`${PREFIX}/state`, `${PREFIX}/presence/+`], { qos: 1 }, () => {
          const pres = JSON.stringify({
            playerId,
            secretToken: `tok-${i + 1}`,
            playerName,
            avatarId: i % 16,
            joinedAt: Date.now(),
          });
          gClient.publish(`${PREFIX}/presence/${playerId}`, pres, { qos: 1, retain: true });
        });
      });

      gClient.on('message', (topic, buf) => {
        if (topic === `${PREFIX}/state`) {
          const str = buf.toString();
          if (!str) return;
          const data = JSON.parse(str);
          if (data?.roomState?.players?.length === TOTAL_GUESTS + 1 && !joined) {
            joined = true;
            resolve(playerName);
          }
        }
      });

      setTimeout(() => {
        if (!joined) {
          reject(new Error(`${playerName} timed out (host saw ${hostPlayers.length} players)`));
        }
      }, 8000);
    });
  });

  try {
    const start = Date.now();
    const results = await Promise.all(guestPromises);
    console.log(`🎉 SUCCESS in ${Date.now() - start}ms! All ${results.length + 1} devices (1 Host + ${results.length} Guests across Phones & Laptops) joined Room "${ROOM_ID}" and synchronized the complete 22-player roster!`);
    guestClients.forEach((c) => c.end());
    hostClient.publish(`${PREFIX}/state`, '', { retain: true }, () => {
      hostClient.end();
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}
