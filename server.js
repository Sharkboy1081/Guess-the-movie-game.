const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const defaultPuzzles = [
  { emoji: '🦁👑', answer: 'The Lion King' },
  { emoji: '👽📞🏠', answer: 'E.T. the Extra-Terrestrial' },
  { emoji: '🦖🏝️', answer: 'Jurassic Park' },
  { emoji: '🧙‍♂️🧝‍♀️💍', answer: 'The Lord of the Rings' },
  { emoji: '🕷️🧑', answer: 'Spider-Man' },
  { emoji: '🚢🧊', answer: 'Titanic' },
  { emoji: '🧊👑', answer: 'Frozen' },
];

const state = {
  puzzles: [...defaultPuzzles],
  currentIndex: Math.floor(Math.random() * defaultPuzzles.length),
  stats: { correct: 0, wrong: 0 },
  players: {},
};

app.use(express.static(path.join(__dirname)));

function serialize(data) {
  return JSON.stringify(data);
}

function broadcast(message) {
  const payload = serialize(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function send(ws, type, data) {
  ws.send(serialize({ type, data }));
}

function getPlayerList() {
  return Object.keys(state.players).map((id) => ({
    id,
    name: state.players[id].name,
    score: state.players[id].score,
  }));
}

function getPublicState() {
  return {
    puzzles: state.puzzles,
    currentIndex: state.currentIndex,
    stats: state.stats,
    players: getPlayerList(),
  };
}

function getRandomIndex() {
  return state.puzzles.length ? Math.floor(Math.random() * state.puzzles.length) : 0;
}

function normalizeText(text) {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9\s]/gi, '');
}

wss.on('connection', (ws) => {
  ws.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  send(ws, 'init', getPublicState());
  broadcast({ type: 'playerList', data: { players: getPlayerList() } });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      send(ws, 'error', { message: 'Invalid message format.' });
      return;
    }

    const { type, data } = message;

    if (type === 'join') {
      const playerName = String(data?.name || 'Player').trim() || 'Player';
      state.players[ws.id] = { name: playerName, score: 0 };
      send(ws, 'init', getPublicState());
      broadcast({ type: 'playerList', data: { players: getPlayerList() } });
      broadcast({ type: 'news', data: { message: `${playerName} joined the game.` } });
      return;
    }

    if (!(ws.id in state.players)) {
      send(ws, 'error', { message: 'Join the game first.' });
      return;
    }

    if (type === 'guess') {
      const guess = normalizeText(data?.guess || '');
      const answer = normalizeText(state.puzzles[state.currentIndex]?.answer || '');
      if (!guess) {
        send(ws, 'error', { message: 'Guess text is required.' });
        return;
      }

      if (guess === answer) {
        state.stats.correct += 1;
        state.players[ws.id].score += 1;
        state.currentIndex = getRandomIndex();
        const result = {
          correct: true,
          message: `${state.players[ws.id].name} guessed correctly!`,
          playerId: ws.id,
          playerName: state.players[ws.id].name,
          playerScore: state.players[ws.id].score,
          state: getPublicState(),
        };
        broadcast({ type: 'guessResult', data: result });
        broadcast({ type: 'state', data: getPublicState() });
      } else {
        state.stats.wrong += 1;
        send(ws, 'guessResult', {
          correct: false,
          message: 'Not quite. Try again.',
          state: getPublicState(),
        });
        broadcast({ type: 'state', data: getPublicState() });
      }
      return;
    }

    if (type === 'nextPuzzle') {
      state.currentIndex = getRandomIndex();
      broadcast({ type: 'state', data: getPublicState() });
      return;
    }

    if (type === 'addPuzzle') {
      const emoji = String(data?.emoji || '').trim();
      const answer = String(data?.answer || '').trim();
      if (!emoji || !answer) {
        send(ws, 'error', { message: 'Both emoji and answer are required.' });
        return;
      }
      state.puzzles.push({ emoji, answer });
      broadcast({ type: 'state', data: getPublicState() });
      broadcast({ type: 'news', data: { message: `${state.players[ws.id].name} added a new puzzle.` } });
      return;
    }

    send(ws, 'error', { message: 'Unknown message type.' });
  });

  ws.on('close', () => {
    const player = state.players[ws.id];
    if (player) {
      broadcast({ type: 'news', data: { message: `${player.name} left the game.` } });
      delete state.players[ws.id];
      broadcast({ type: 'playerList', data: { players: getPlayerList() } });
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
