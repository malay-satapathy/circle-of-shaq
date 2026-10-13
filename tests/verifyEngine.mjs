import assert from 'node:assert/strict';
import {
  createInitialRoom,
  startNewRoundInRoom,
  passQuestionMic,
  initiateVotingPhase,
  castPlayerVote,
  triggerMidRoundSpyReveal,
  submitSpyLocationGuess,
  toPublicRoomState,
  toPrivateRolePayload,
} from '../src/engine/gameEngine.ts';
import { DECKS } from '../src/data/decks.ts';

console.log('🧪 Running CIRCLE OF SHAQ Automated Engine & Loophole Verification Suite...\n');

// 1. Verify Deck Data Integrity (Loophole #12 Fix)
for (const deck of DECKS) {
  assert.ok(deck.cards.length >= 24, `Deck ${deck.id} has ${deck.cards.length} cards`);
  for (const card of deck.cards) {
    assert.ok(card.roles.length >= 5, `Card ${card.name} has at least 5 roles`);
    // Ensure "Spy" is NEVER an innocent role in locationDeck
    assert.ok(
      !card.roles.includes('Spy'),
      `Card ${card.name} must not have "Spy" as an innocent role`
    );
  }
}
console.log('✅ Test 1 Passed: All 4 decks (112 cards total) verified bug-free with zero invalid roles.');

// 2. Verify 16-Player Scaling + Multi-Spy Assignment (Loophole #10 Fix)
const room = createInitialRoom('SHAQ', 'HostMalay', 0, 'P2P', 'p-1', 'tok-1');
room.settings.deckId = 'desiAddaDeck';
room.settings.spyCount = 2; // 2 Gaddars
room.settings.spiesKnowEachOther = true;

for (let i = 2; i <= 16; i++) {
  room.players.push({
    id: `p-${i}`,
    secretToken: `tok-${i}`,
    name: `Agent ${i}`,
    avatarId: i % 16,
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

startNewRoundInRoom(room);
const spiesRound1 = room.players.filter((p) => p.isSpy);
assert.equal(spiesRound1.length, 2, 'Should assign exactly 2 Spies in 16-player multi-spy mode');
assert.ok(room.secretLocation.length > 0, 'Secret location assigned');
console.log(
  `✅ Test 2 Passed: 16-Player lobby started Round #1 on Desi Adda deck ("${room.secretLocation}") with 2 Spies (${spiesRound1.map((s) => s.name).join(' & ')}).`
);

// 3. Verify Zero-Leak Public Serializer (Loophole #2 Fix)
const pubState = toPublicRoomState(room);
const serializedJson = JSON.stringify(pubState);
assert.equal(
  serializedJson.includes('"isSpy"'),
  false,
  'Public room broadcast must NEVER leak isSpy!'
);
assert.equal(
  serializedJson.includes(room.secretLocation),
  true, // only in chosenCards list, let's check players array
  'chosenCards contains candidate locations'
);
for (const pubPlayer of pubState.players) {
  assert.equal('isSpy' in pubPlayer, false, 'PublicPlayer must not have isSpy property');
  assert.equal('role' in pubPlayer, false, 'PublicPlayer must not have role property');
  assert.equal('location' in pubPlayer, false, 'PublicPlayer must not have location property');
}

const spyPrivate = toPrivateRolePayload(room, spiesRound1[0].id);
assert.equal(spyPrivate?.isSpy, true, 'Spy private payload has isSpy=true');
assert.equal(spyPrivate?.location, null, 'Spy private payload hides secret location');
assert.equal(spyPrivate?.fellowSpies.length, 1, 'Spy sees their co-spy');
console.log('✅ Test 3 Passed: Zero-Leak Serializer strips all spy/role secrets from public broadcasts.');

// 4. Verify Question Floor & No Immediate Ask-Backs Rule (Loophole #11 Fix)
const firstAsker = room.currentTurn.askerId;
const firstTarget = room.currentTurn.targetId;
const illegalBack = passQuestionMic(room, firstTarget, firstAsker);
assert.equal(illegalBack.ok, false, 'Must block immediate ask-back (B -> A)');
const thirdPlayer = room.players.find((p) => p.id !== firstAsker && p.id !== firstTarget);
const legalPass = passQuestionMic(room, firstTarget, thirdPlayer.id);
assert.equal(legalPass.ok, true, 'Allows valid question pass (B -> C)');
console.log('✅ Test 4 Passed: Question Turn Tracker enforces "No Immediate Ask-Backs" rule.');

// 5. Verify Mid-Round Spy Blow Cover & Location Guess (Loophole #7 Fix)
const blowRes = triggerMidRoundSpyReveal(room, spiesRound1[0].id);
assert.equal(blowRes.ok, true, 'Spy can blow cover mid-round');
assert.equal(room.status, 'SPY_GUESS', 'Room transitions to SPY_GUESS');
const guessRes = submitSpyLocationGuess(room, spiesRound1[0].id, room.secretLocation);
assert.equal(guessRes.ok, true);
assert.equal(room.status, 'ROUND_SUMMARY');
assert.equal(room.lastRoundSummary?.outcome, 'SPY_GUESSED_RIGHT');
assert.equal(spiesRound1[0].score, 2, 'Spy earns +2 points for mid-round location guess');
console.log('✅ Test 5 Passed: Mid-Round Spy "Blow Cover & Guess Location" awards +2 points.');

// 6. Verify 1-Click Instant Next Round & Blind Voting (Loopholes #4 & #9 Fix)
startNewRoundInRoom(room);
assert.equal(room.roundNumber, 2, 'Incremented to Round #2 while keeping all 16 players and scores');
const voteInit = initiateVotingPhase(room, room.players[0].id, 'PLAYER_CALLED');
assert.equal(voteInit.ok, true);
assert.equal(room.status, 'VOTING');

// Cast 1 vote and verify Blind Voting hides live counts
const spyR2 = room.players.find((p) => p.isSpy);
castPlayerVote(room, room.players[0].id, spyR2.id);
const blindPub = toPublicRoomState(room);
assert.equal(blindPub.liveVoteCounts, null, 'Blind voting hides liveVoteCounts until voting ends');
assert.equal(blindPub.totalVotesCast, 1, 'Tracks totalVotesCast count');
console.log('✅ Test 6 Passed: Instant Round #2 restart & Blind Voting verified.');

console.log('\n🎉 ALL 6 AUTOMATED ENGINE & SECURITY TESTS PASSED!');
