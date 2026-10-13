import { DECKS, getDeckById } from '../data/decks.ts';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'VOTING' | 'SPY_GUESS' | 'ROUND_SUMMARY' | 'PODIUM';

export type VotingMode = 'BLIND_MAJORITY' | 'LIVE_MAJORITY' | 'UNANIMOUS';

export interface RoomSettings {
  deckId: string;
  timerDurationSeconds: number; // 180 to 900 (3 to 15 mins)
  cardCount: number; // 16 to 36
  spyCount: number; // 1, 2, or 3 (or 0 = auto-scale by player count)
  spiesKnowEachOther: boolean;
  votingMode: VotingMode;
  allowMidRoundAccusation: boolean;
  allowMidRoundSpyGuess: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatarId: number;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  isSpectator: boolean;
  timesQuestioned: number;
  hasUsedAccusation: boolean;
  hasVoted: boolean;
}

export interface PrivateRolePayload {
  roundNumber: number;
  isSpy: boolean;
  role: string;
  location: string | null;
  locationEmoji: string | null;
  fellowSpies: { id: string; name: string }[]; // only populated if isSpy && spiesKnowEachOther
}

export interface QuestionTurn {
  askerId: string;
  askerName: string;
  targetId: string;
  targetName: string;
  previousAskerId: string | null;
  timestamp: number;
}

export interface RoundLogItem {
  id: string;
  timestamp: number;
  text: string;
  type: 'info' | 'question' | 'accuse' | 'spy_guess' | 'result';
}

export interface RoundSummaryData {
  outcome: 'SPY_ESCAPED' | 'SPY_CAUGHT' | 'SPY_GUESSED_RIGHT' | 'SPY_GUESSED_WRONG';
  headline: string;
  subtext: string;
  secretLocation: string;
  secretLocationEmoji: string;
  spies: { id: string; name: string; avatarId: number }[];
  accusedPlayerId: string | null;
  spyGuessedLocation: string | null;
  votesByVoter: Record<string, string>; // voterId -> targetId
  scoreDeltas: Record<string, number>; // playerId -> +points earned this round
}

export interface PublicRoomState {
  roomId: string;
  mode: 'CLOUD' | 'P2P' | 'PASS_AND_PLAY';
  status: RoomStatus;
  roundNumber: number;
  settings: RoomSettings;
  players: PublicPlayer[];
  chosenCards: { name: string; emoji: string; category: string }[];
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  pausedRemainingMs: number | null;
  votingCallerId: string | null;
  votingCallerName: string | null;
  votingEndsAt: number | null;
  liveVoteCounts: Record<string, number> | null; // null when BLIND_MAJORITY is active during voting
  totalVotesCast: number;
  spyGuessingPlayerId: string | null;
  spyGuessingPlayerName: string | null;
  spyGuessEndsAt: number | null;
  currentTurn: QuestionTurn | null;
  logs: RoundLogItem[];
  lastRoundSummary: RoundSummaryData | null;
}

export interface InternalPlayer extends PublicPlayer {
  secretToken: string;
  isSpy: boolean;
  role: string;
  location: string | null;
  timesWasSpy: number;
}

export interface InternalRoom {
  roomId: string;
  mode: 'CLOUD' | 'P2P' | 'PASS_AND_PLAY';
  status: RoomStatus;
  roundNumber: number;
  settings: RoomSettings;
  players: InternalPlayer[];
  chosenCards: { name: string; emoji: string; category: string }[];
  secretLocation: string;
  secretLocationEmoji: string;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  pausedRemainingMs: number | null;
  votingCallerId: string | null;
  votingCallerName: string | null;
  votingEndsAt: number | null;
  votes: Record<string, string>; // voterId -> targetId
  spyGuessingPlayerId: string | null;
  spyGuessingPlayerName: string | null;
  spyGuessEndsAt: number | null;
  currentTurn: QuestionTurn | null;
  logs: RoundLogItem[];
  lastRoundSummary: RoundSummaryData | null;
  previousLocations: string[];
}

export function createInitialRoom(
  roomId: string,
  hostName: string,
  hostAvatarId: number,
  mode: 'CLOUD' | 'P2P' | 'PASS_AND_PLAY' = 'P2P',
  hostId = 'player-host',
  hostToken = 'token-host'
): InternalRoom {
  const defaultDeck = DECKS[0];
  return {
    roomId,
    mode,
    status: 'LOBBY',
    roundNumber: 0,
    settings: {
      deckId: defaultDeck.id,
      timerDurationSeconds: 480,
      cardCount: 24,
      spyCount: 1,
      spiesKnowEachOther: true,
      votingMode: 'BLIND_MAJORITY',
      allowMidRoundAccusation: true,
      allowMidRoundSpyGuess: true,
    },
    players: [
      {
        id: hostId,
        name: hostName.trim().slice(0, 24) || 'Host Agent',
        avatarId: hostAvatarId,
        score: 0,
        isHost: true,
        isConnected: true,
        isSpectator: false,
        timesQuestioned: 0,
        hasUsedAccusation: false,
        hasVoted: false,
        secretToken: hostToken,
        isSpy: false,
        role: '',
        location: null,
        timesWasSpy: 0,
      },
    ],
    chosenCards: defaultDeck.cards.slice(0, 24).map((c) => ({
      name: c.name,
      emoji: c.emoji,
      category: c.category,
    })),
    secretLocation: '',
    secretLocationEmoji: '',
    roundStartedAt: null,
    roundEndsAt: null,
    pausedRemainingMs: null,
    votingCallerId: null,
    votingCallerName: null,
    votingEndsAt: null,
    votes: {},
    spyGuessingPlayerId: null,
    spyGuessingPlayerName: null,
    spyGuessEndsAt: null,
    currentTurn: null,
    logs: [],
    lastRoundSummary: null,
    previousLocations: [],
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function startNewRoundInRoom(room: InternalRoom): InternalRoom {
  const deck = getDeckById(room.settings.deckId);
  const nextRound = room.roundNumber + 1;

  // Activate all connected players (spectators from previous round now join!)
  room.players.forEach((p) => {
    p.isSpectator = false;
    p.timesQuestioned = 0;
    p.hasUsedAccusation = false;
    p.hasVoted = false;
    p.isSpy = false;
    p.role = '';
    p.location = null;
  });

  const activePlayers = room.players.filter((p) => p.isConnected || room.mode === 'PASS_AND_PLAY');
  const count = Math.min(Math.max(deck.minCards, room.settings.cardCount), deck.cards.length);

  // Pick fresh chosen cards for this round! (Fixes spyfall.co Loophole #4)
  const shuffledDeckCards = shuffleArray(deck.cards).slice(0, count);
  room.chosenCards = shuffledDeckCards
    .map((c) => ({ name: c.name, emoji: c.emoji, category: c.category }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Avoid repeating recent locations
  let candidateLocations = shuffledDeckCards.filter(
    (c) => !room.previousLocations.slice(-4).includes(c.name)
  );
  if (candidateLocations.length === 0) {
    candidateLocations = shuffledDeckCards;
  }
  const winningCard = candidateLocations[Math.floor(Math.random() * candidateLocations.length)];
  room.secretLocation = winningCard.name;
  room.secretLocationEmoji = winningCard.emoji;
  room.previousLocations.push(winningCard.name);

  // Determine how many spies (1, 2, 3, or auto)
  let targetSpyCount = room.settings.spyCount;
  if (targetSpyCount === 0) {
    // Auto-scale: 3-7 players = 1 spy, 8-13 players = 2 spies, 14+ = 3 spies
    if (activePlayers.length >= 14) targetSpyCount = 3;
    else if (activePlayers.length >= 8) targetSpyCount = 2;
    else targetSpyCount = 1;
  }
  targetSpyCount = Math.min(targetSpyCount, Math.max(1, Math.floor((activePlayers.length - 1) / 2)));

  // Anti-streak weighted shuffle for selecting spies
  const minSpyTimes = Math.min(...activePlayers.map((p) => p.timesWasSpy));
  const weightedPool: InternalPlayer[] = [];
  activePlayers.forEach((p) => {
    const weight = p.timesWasSpy === minSpyTimes ? 3 : p.timesWasSpy === minSpyTimes + 1 ? 2 : 1;
    for (let i = 0; i < weight; i++) weightedPool.push(p);
  });

  const chosenSpyIds = new Set<string>();
  const shuffledPool = shuffleArray(weightedPool);
  for (const candidate of shuffledPool) {
    if (chosenSpyIds.size < targetSpyCount) {
      chosenSpyIds.add(candidate.id);
    }
  }

  // Assign roles to non-spies
  const shuffledRoles = shuffleArray(winningCard.roles);
  let roleIdx = 0;

  activePlayers.forEach((p) => {
    if (chosenSpyIds.has(p.id)) {
      p.isSpy = true;
      p.role = deck.spyTitle;
      p.location = null;
      p.timesWasSpy += 1;
    } else {
      p.isSpy = false;
      p.role = shuffledRoles[roleIdx % shuffledRoles.length];
      p.location = winningCard.name;
      roleIdx += 1;
    }
  });

  // Set up initial question turn (random starter -> random target)
  const shuffledActive = shuffleArray(activePlayers);
  const firstAsker = shuffledActive[0];
  const firstTarget = shuffledActive[1] || shuffledActive[0];
  room.currentTurn = {
    askerId: firstAsker.id,
    askerName: firstAsker.name,
    targetId: firstTarget.id,
    targetName: firstTarget.name,
    previousAskerId: null,
    timestamp: Date.now(),
  };
  firstTarget.timesQuestioned = 1;

  const now = Date.now();
  room.roundNumber = nextRound;
  room.status = 'PLAYING';
  room.roundStartedAt = now;
  room.roundEndsAt = now + room.settings.timerDurationSeconds * 1000;
  room.pausedRemainingMs = null;
  room.votingCallerId = null;
  room.votingCallerName = null;
  room.votingEndsAt = null;
  room.votes = {};
  room.spyGuessingPlayerId = null;
  room.spyGuessingPlayerName = null;
  room.spyGuessEndsAt = null;
  room.lastRoundSummary = null;
  room.logs = [
    {
      id: `log-${now}-start`,
      timestamp: now,
      text: `Round #${nextRound} started! ${firstAsker.name} opens the questioning with ${firstTarget.name}.`,
      type: 'info',
    },
  ];

  return room;
}

export function passQuestionMic(
  room: InternalRoom,
  fromPlayerId: string,
  toTargetId: string
): { ok: boolean; error?: string } {
  const fromPlayer = room.players.find((p) => p.id === fromPlayerId);
  const toTarget = room.players.find((p) => p.id === toTargetId);
  if (!fromPlayer || !toTarget) return { ok: false, error: 'Player not found' };
  if (fromPlayerId === toTargetId) return { ok: false, error: 'You cannot question yourself!' };

  if (
    room.currentTurn &&
    room.currentTurn.askerId === toTargetId &&
    room.currentTurn.targetId === fromPlayerId &&
    room.players.filter((p) => !p.isSpectator).length > 2
  ) {
    return {
      ok: false,
      error: `No immediate ask-backs! ${toTarget.name} just questioned ${fromPlayer.name}. Pick someone else!`,
    };
  }

  room.currentTurn = {
    askerId: fromPlayer.id,
    askerName: fromPlayer.name,
    targetId: toTarget.id,
    targetName: toTarget.name,
    previousAskerId: room.currentTurn?.askerId || null,
    timestamp: Date.now(),
  };
  toTarget.timesQuestioned += 1;

  room.logs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    text: `${fromPlayer.name} ➔ questioned ${toTarget.name}`,
    type: 'question',
  });
  room.logs = room.logs.slice(0, 30);

  return { ok: true };
}

export function initiateVotingPhase(
  room: InternalRoom,
  callerId: string | null,
  reason: 'TIMER_EXPIRED' | 'PLAYER_CALLED' | 'HOST_ENDED_ROUND'
): { ok: boolean; error?: string } {
  if (room.status !== 'PLAYING') {
    return { ok: false, error: 'Round is not in active play.' };
  }

  const now = Date.now();
  let callerName = 'Timer Expired';
  if (reason === 'PLAYER_CALLED') {
    const caller = callerId ? room.players.find((p) => p.id === callerId) : null;
    callerName = caller ? caller.name : 'Circle Agent';
    if (caller) {
      caller.hasUsedAccusation = true;
    }
  } else if (reason === 'HOST_ENDED_ROUND') {
    callerName = 'Host';
  }

  // Pause main round timer in case voting is cancelled or resumed
  if (room.roundEndsAt) {
    room.pausedRemainingMs = Math.max(5000, room.roundEndsAt - now);
  }
  room.status = 'VOTING';
  room.votingCallerId = callerId;
  room.votingCallerName = callerName;
  room.votingEndsAt = now + 45000; // 45s voting window
  room.votes = {};
  room.players.forEach((p) => {
    p.hasVoted = false;
  });

  room.logs.unshift({
    id: `log-${now}-vote`,
    timestamp: now,
    text:
      reason === 'TIMER_EXPIRED'
        ? '⏰ Time is up! Final Circle of Shaq voting has begun.'
        : `🚨 ${callerName} rang the Shaq Siren and called a vote!`,
    type: 'accuse',
  });

  return { ok: true };
}

export function cancelVotingPhase(room: InternalRoom): { ok: boolean } {
  if (room.status !== 'VOTING') return { ok: false };
  const now = Date.now();
  const remaining = room.pausedRemainingMs || 120000;
  room.status = 'PLAYING';
  room.roundEndsAt = now + remaining;
  room.pausedRemainingMs = null;
  room.votingCallerId = null;
  room.votingCallerName = null;
  room.votingEndsAt = null;
  room.votes = {};
  room.players.forEach((p) => {
    p.hasVoted = false;
  });
  return { ok: true };
}

export function castPlayerVote(
  room: InternalRoom,
  voterId: string,
  targetId: string
): { ok: boolean; allVoted: boolean } {
  if (room.status !== 'VOTING') return { ok: false, allVoted: false };
  const voter = room.players.find((p) => p.id === voterId && !p.isSpectator);
  const target = room.players.find((p) => p.id === targetId && !p.isSpectator);
  if (!voter || !target) return { ok: false, allVoted: false };

  room.votes[voterId] = targetId;
  voter.hasVoted = true;

  const eligibleVoters = room.players.filter((p) => !p.isSpectator && (p.isConnected || room.mode === 'PASS_AND_PLAY'));
  const allVoted = eligibleVoters.every((p) => Boolean(room.votes[p.id]));

  if (allVoted) {
    finalizeVotingOutcome(room);
  }

  return { ok: true, allVoted };
}

export function finalizeVotingOutcome(room: InternalRoom): void {
  if (room.status !== 'VOTING') return;

  const eligibleVoters = room.players.filter((p) => !p.isSpectator);
  const counts: Record<string, number> = {};
  Object.values(room.votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
  });

  // Find top-voted suspect
  let topTargetId: string | null = null;
  let topVotes = 0;
  let isTie = false;

  for (const [tId, cnt] of Object.entries(counts)) {
    if (cnt > topVotes) {
      topVotes = cnt;
      topTargetId = tId;
      isTie = false;
    } else if (cnt === topVotes) {
      isTie = true;
    }
  }

  const totalEligible = Math.max(1, eligibleVoters.length);
  const nonSpyVoterCount = Math.max(1, eligibleVoters.filter((p) => !p.isSpy).length);

  let caughtSuspect: InternalPlayer | undefined;
  if (!isTie && topTargetId) {
    if (room.settings.votingMode === 'UNANIMOUS') {
      // Unanimous among non-spies (or all except accused)
      if (topVotes >= totalEligible - 1) {
        caughtSuspect = room.players.find((p) => p.id === topTargetId);
      }
    } else {
      // Majority (> 50% of votes cast or >= half of eligible)
      if (topVotes > Math.floor(totalEligible / 2) || topVotes >= nonSpyVoterCount) {
        caughtSuspect = room.players.find((p) => p.id === topTargetId);
      }
    }
  }

  const now = Date.now();

  if (caughtSuspect && caughtSuspect.isSpy) {
    // They caught a spy! Give the spy 30 seconds for a last-chance location guess to steal 1 pt
    room.status = 'SPY_GUESS';
    room.spyGuessingPlayerId = caughtSuspect.id;
    room.spyGuessingPlayerName = caughtSuspect.name;
    room.spyGuessEndsAt = now + 35000;
    room.logs.unshift({
      id: `log-${now}-caught`,
      timestamp: now,
      text: `🎯 The Circle caught ${caughtSuspect.name}! They have 35s to guess the secret ${getDeckById(room.settings.deckId).cardNoun.toLowerCase()}.`,
      type: 'spy_guess',
    });
    return;
  }

  // Either nobody got majority, or an innocent player was voted out! Spies escape!
  const accusedInnocent = caughtSuspect && !caughtSuspect.isSpy ? caughtSuspect : null;
  concludeRoundWithScoring(room, 'SPY_ESCAPED', accusedInnocent?.id || topTargetId, null);
}

export function triggerMidRoundSpyReveal(
  room: InternalRoom,
  spyPlayerId: string
): { ok: boolean; error?: string } {
  if (room.status !== 'PLAYING') {
    return { ok: false, error: 'Can only blow cover during an active round!' };
  }
  const spy = room.players.find((p) => p.id === spyPlayerId);
  if (!spy || !spy.isSpy) {
    return { ok: false, error: 'Only an active Gaddar/Spy can blow cover!' };
  }

  const now = Date.now();
  if (room.roundEndsAt) {
    room.pausedRemainingMs = Math.max(0, room.roundEndsAt - now);
  }
  room.status = 'SPY_GUESS';
  room.spyGuessingPlayerId = spy.id;
  room.spyGuessingPlayerName = spy.name;
  room.spyGuessEndsAt = now + 35000;

  room.logs.unshift({
    id: `log-${now}-blowcover`,
    timestamp: now,
    text: `💣 DHOKHA! ${spy.name} blew their cover and is guessing the secret location!`,
    type: 'spy_guess',
  });

  return { ok: true };
}

export function submitSpyLocationGuess(
  room: InternalRoom,
  spyPlayerId: string,
  guessedLocation: string
): { ok: boolean; error?: string } {
  if (room.status !== 'SPY_GUESS') {
    return { ok: false, error: 'Not currently in Spy Guess phase.' };
  }
  const spy = room.players.find((p) => p.id === spyPlayerId && p.isSpy);
  if (!spy) {
    return { ok: false, error: 'Only the Spy can submit the location guess.' };
  }

  const isCorrect = guessedLocation.trim().toLowerCase() === room.secretLocation.trim().toLowerCase();
  concludeRoundWithScoring(
    room,
    isCorrect ? 'SPY_GUESSED_RIGHT' : 'SPY_GUESSED_WRONG',
    spy.id,
    guessedLocation
  );
  return { ok: true };
}

export function concludeRoundWithScoring(
  room: InternalRoom,
  outcome: 'SPY_ESCAPED' | 'SPY_CAUGHT' | 'SPY_GUESSED_RIGHT' | 'SPY_GUESSED_WRONG',
  accusedPlayerId: string | null,
  spyGuessedLocation: string | null
): void {
  const deck = getDeckById(room.settings.deckId);
  const spies = room.players.filter((p) => p.isSpy && !p.isSpectator);
  const innocents = room.players.filter((p) => !p.isSpy && !p.isSpectator);
  const scoreDeltas: Record<string, number> = {};

  room.players.forEach((p) => {
    scoreDeltas[p.id] = 0;
  });

  const wasCaughtByVote = Object.keys(room.votes).length > 0;
  let headline = '';
  let subtext = '';

  if (outcome === 'SPY_ESCAPED') {
    spies.forEach((s) => {
      s.score += 2;
      scoreDeltas[s.id] = (scoreDeltas[s.id] || 0) + 2;
    });
    const spyNames = spies.map((s) => s.name).join(' & ');
    const accused = room.players.find((p) => p.id === accusedPlayerId);
    headline = `Dhokha Successful! ${spyNames} Escaped (+2 pts)`;
    subtext =
      accused && !accused.isSpy
        ? `The Circle wrongly accused innocent agent ${accused.name}!`
        : `The Circle failed to reach consensus on the ${deck.spyTitle}.`;
  } else if (outcome === 'SPY_GUESSED_RIGHT') {
    const pts = wasCaughtByVote ? 1 : 2;
    spies.forEach((s) => {
      s.score += pts;
      scoreDeltas[s.id] = (scoreDeltas[s.id] || 0) + pts;
    });
    // Also if innocents caught the spy first, innocents who voted for the spy get +1
    if (wasCaughtByVote) {
      innocents.forEach((inn) => {
        if (room.votes[inn.id] && spies.some((s) => s.id === room.votes[inn.id])) {
          inn.score += 1;
          scoreDeltas[inn.id] = (scoreDeltas[inn.id] || 0) + 1;
        }
      });
    }
    headline = `${room.spyGuessingPlayerName || deck.spyTitle} Nailed the ${deck.cardNoun}! (+${pts} pts)`;
    subtext = `Correctly deduced "${room.secretLocation}" ${
      wasCaughtByVote ? 'during their last-chance redemption guess!' : 'by blowing cover mid-round!'
    }`;
  } else {
    // SPY_CAUGHT or SPY_GUESSED_WRONG
    innocents.forEach((inn) => {
      const votedRight = room.votes[inn.id] && spies.some((s) => s.id === room.votes[inn.id]);
      const bonus = votedRight ? 2 : 1;
      inn.score += bonus;
      scoreDeltas[inn.id] = (scoreDeltas[inn.id] || 0) + bonus;
    });
    const spyNames = spies.map((s) => s.name).join(' & ');
    headline = `Circle Wins! ${spyNames} Exposed!`;
    subtext = spyGuessedLocation
      ? `${room.spyGuessingPlayerName || spyNames} guessed "${spyGuessedLocation}", but the real ${deck.cardNoun.toLowerCase()} was "${room.secretLocation}"!`
      : `${spyNames} ran out of time and couldn't guess "${room.secretLocation}"!`;
  }

  room.status = 'ROUND_SUMMARY';
  room.roundEndsAt = null;
  room.votingEndsAt = null;
  room.spyGuessEndsAt = null;
  room.lastRoundSummary = {
    outcome,
    headline,
    subtext,
    secretLocation: room.secretLocation,
    secretLocationEmoji: room.secretLocationEmoji,
    spies: spies.map((s) => ({ id: s.id, name: s.name, avatarId: s.avatarId })),
    accusedPlayerId,
    spyGuessedLocation,
    votesByVoter: { ...room.votes },
    scoreDeltas,
  };

  room.logs.unshift({
    id: `log-${Date.now()}-summary`,
    timestamp: Date.now(),
    text: `🏆 ${headline}`,
    type: 'result',
  });
}

/**
 * Zero-Leak Serializer (Fixes spyfall.co Loophole #2!)
 * Strips all secret role/location/isSpy fields from the public room broadcast.
 */
export function toPublicRoomState(room: InternalRoom): PublicRoomState {
  let liveVoteCounts: Record<string, number> | null = null;
  if (room.status !== 'VOTING' || room.settings.votingMode !== 'BLIND_MAJORITY') {
    liveVoteCounts = {};
    Object.values(room.votes).forEach((tId) => {
      liveVoteCounts![tId] = (liveVoteCounts![tId] || 0) + 1;
    });
  }

  return {
    roomId: room.roomId,
    mode: room.mode,
    status: room.status,
    roundNumber: room.roundNumber,
    settings: { ...room.settings },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarId: p.avatarId,
      score: p.score,
      isHost: p.isHost,
      isConnected: p.isConnected,
      isSpectator: p.isSpectator,
      timesQuestioned: p.timesQuestioned,
      hasUsedAccusation: p.hasUsedAccusation,
      hasVoted: p.hasVoted,
    })),
    chosenCards: room.chosenCards,
    roundStartedAt: room.roundStartedAt,
    roundEndsAt: room.roundEndsAt,
    pausedRemainingMs: room.pausedRemainingMs,
    votingCallerId: room.votingCallerId,
    votingCallerName: room.votingCallerName,
    votingEndsAt: room.votingEndsAt,
    liveVoteCounts,
    totalVotesCast: Object.keys(room.votes).length,
    spyGuessingPlayerId: room.spyGuessingPlayerId,
    spyGuessingPlayerName: room.spyGuessingPlayerName,
    spyGuessEndsAt: room.spyGuessEndsAt,
    currentTurn: room.currentTurn,
    logs: room.logs,
    lastRoundSummary: room.lastRoundSummary,
  };
}

/**
 * Generates the private role assignment for a single specific player ONLY.
 */
export function toPrivateRolePayload(room: InternalRoom, playerId: string): PrivateRolePayload | null {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.isSpectator || room.roundNumber === 0) return null;

  const fellowSpies =
    player.isSpy && room.settings.spiesKnowEachOther
      ? room.players
          .filter((p) => p.isSpy && p.id !== player.id && !p.isSpectator)
          .map((p) => ({ id: p.id, name: p.name }))
      : [];

  return {
    roundNumber: room.roundNumber,
    isSpy: player.isSpy,
    role: player.role,
    location: player.isSpy ? null : room.secretLocation,
    locationEmoji: player.isSpy ? null : room.secretLocationEmoji,
    fellowSpies,
  };
}
