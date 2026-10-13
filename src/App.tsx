import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { GamePlayView } from './components/GamePlayView';
import { PodiumView } from './components/PodiumView';

const GameRouter: React.FC = () => {
  const { roomState } = useGame();

  // Check URL query parameter ?join=ABCD for direct invite links
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get('join') || '';

  if (!roomState) {
    return <HomeView initialJoinCode={joinParam} />;
  }

  if (roomState.status === 'LOBBY') {
    return <LobbyView />;
  }

  if (roomState.status === 'PODIUM') {
    return <PodiumView />;
  }

  return <GamePlayView />;
};

export function App() {
  return (
    <GameProvider>
      <GameRouter />
    </GameProvider>
  );
}

export default App;
