const puzzlesKey = 'emojiMoviePuzzles';
const statsKey = 'emojiMovieStats';

const defaultPuzzles = [
  { emoji: '🦁👑', answer: 'The Lion King' },
  { emoji: '👽📞🏠', answer: 'E.T. the Extra-Terrestrial' },
  { emoji: '🦖🏝️', answer: 'Jurassic Park' },
  { emoji: '🧙‍♂️🧝‍♀️💍', answer: 'The Lord of the Rings' },
  { emoji: '🕷️🧑', answer: 'Spider-Man' },
  { emoji: '🚢🧊', answer: 'Titanic' },
  { emoji: '🧊👑', answer: 'Frozen' },
];

const currentPuzzleEl = document.getElementById('currentPuzzle');
const guessInput = document.getElementById('guessInput');
const feedbackEl = document.getElementById('feedback');
const puzzleCountEl = document.getElementById('puzzleCount');
const correctCountEl = document.getElementById('correctCount');
const wrongCountEl = document.getElementById('wrongCount');
const addPuzzleForm = document.getElementById('addPuzzleForm');
const newEmojiInput = document.getElementById('newEmoji');
const newAnswerInput = document.getElementById('newAnswer');
const checkGuessBtn = document.getElementById('checkGuessBtn');
const showAnswerBtn = document.getElementById('showAnswerBtn');
const nextPuzzleBtn = document.getElementById('nextPuzzleBtn');
const remoteSetupForm = document.getElementById('remoteSetupForm');
const remotePlayerNameInput = document.getElementById('remotePlayerName');
const remoteStatus = document.getElementById('remoteStatus');
const remotePlayers = document.getElementById('remotePlayers');
const remotePlayersList = document.getElementById('remotePlayersList');

let puzzles = [];
let stats = { correct: 0, wrong: 0 };
let currentIndex = 0;
let socket = null;
let remoteActive = false;

function setRemoteStatus(text) {
  remoteStatus.textContent = text;
}

function updateRemotePlayers(players) {
  if (!players || !players.length) {
    remotePlayers.classList.add('hidden');
    remotePlayersList.innerHTML = '';
    return;
  }

  remotePlayers.classList.remove('hidden');
  remotePlayersList.innerHTML = players
    .map((player) => `<li>${player.name} — ${player.score} point${player.score === 1 ? '' : 's'}</li>`)
    .join('');
}

function connectRemote(event) {
  event.preventDefault();
  const name = remotePlayerNameInput.value.trim() || 'Player';

  if (socket && socket.readyState === WebSocket.OPEN) {
    setRemoteStatus('Already connected.');
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener('open', () => {
    setRemoteStatus('Connected to server. Joining game...');
    sendRemote({ type: 'join', data: { name } });
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleRemoteMessage(message);
    } catch (error) {
      console.error('Invalid server message', error);
    }
  });

  socket.addEventListener('close', () => {
    remoteActive = false;
    setRemoteStatus('Disconnected from server.');
    updateRemotePlayers([]);
  });

  socket.addEventListener('error', () => {
    setRemoteStatus('Connection error.');
  });
}

function sendRemote(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setRemoteStatus('Not connected to server.');
    return;
  }

  socket.send(JSON.stringify(payload));
}

function handleRemoteMessage(message) {
  const { type, data } = message;

  if (type === 'init' || type === 'state') {
    puzzles = data.puzzles;
    stats = data.stats;
    currentIndex = data.currentIndex;
    updateStats();
    showPuzzle(currentIndex);
    updateRemotePlayers(data.players || []);
    remoteActive = true;
    setRemoteStatus('Connected and synced with game server.');
    return;
  }

  if (type === 'playerList') {
    updateRemotePlayers(data.players || []);
    return;
  }

  if (type === 'guessResult') {
    feedbackEl.textContent = data.message;
    if (data.state) {
      puzzles = data.state.puzzles;
      stats = data.state.stats;
      currentIndex = data.state.currentIndex;
      updateStats();
      showPuzzle(currentIndex);
    }
    return;
  }

  if (type === 'error') {
    feedbackEl.textContent = `⚠️ ${data.message}`;
    return;
  }

  if (type === 'news') {
    feedbackEl.textContent = data.message;
    return;
  }
}

function loadFromStorage() {
  const savedPuzzles = localStorage.getItem(puzzlesKey);
  const savedStats = localStorage.getItem(statsKey);

  puzzles = savedPuzzles ? JSON.parse(savedPuzzles) : [...defaultPuzzles];
  stats = savedStats ? JSON.parse(savedStats) : { correct: 0, wrong: 0 };
}

function saveToStorage() {
  localStorage.setItem(puzzlesKey, JSON.stringify(puzzles));
  localStorage.setItem(statsKey, JSON.stringify(stats));
}

function getRandomIndex() {
  return Math.floor(Math.random() * puzzles.length);
}

function normalizeText(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/gi, '');
}

function showPuzzle(index) {
  if (!puzzles.length) {
    currentPuzzleEl.textContent = 'No puzzles yet. Add one!';
    return;
  }
  currentIndex = index;
  currentPuzzleEl.textContent = puzzles[index].emoji;
  feedbackEl.textContent = '';
  guessInput.value = '';
  guessInput.focus();
}

function updateStats() {
  puzzleCountEl.textContent = puzzles.length;
  correctCountEl.textContent = stats.correct;
  wrongCountEl.textContent = stats.wrong;
}

function checkGuess() {
  if (!puzzles.length) return;
  const guess = normalizeText(guessInput.value);
  const answer = normalizeText(puzzles[currentIndex].answer);

  if (!guess) {
    feedbackEl.textContent = 'Write a guess before checking.';
    return;
  }

  if (remoteActive) {
    sendRemote({ type: 'guess', data: { guess: guessInput.value } });
    return;
  }

  if (guess === answer) {
    feedbackEl.textContent = '✅ Correct! Great job.';
    stats.correct += 1;
    saveToStorage();
    updateStats();
  } else {
    feedbackEl.textContent = '❌ Not quite. Try again or show the answer.';
    stats.wrong += 1;
    saveToStorage();
    updateStats();
  }
}

function showAnswer() {
  if (!puzzles.length) return;
  feedbackEl.textContent = `🎥 Answer: ${puzzles[currentIndex].answer}`;
}

function nextPuzzle() {
  if (!puzzles.length) return;

  if (remoteActive) {
    sendRemote({ type: 'nextPuzzle' });
    return;
  }

  const nextIndex = getRandomIndex();
  showPuzzle(nextIndex === currentIndex && puzzles.length > 1 ? (currentIndex + 1) % puzzles.length : nextIndex);
}

function addPuzzle(event) {
  event.preventDefault();
  const emoji = newEmojiInput.value.trim();
  const answer = newAnswerInput.value.trim();

  if (!emoji || !answer) {
    feedbackEl.textContent = 'Please add both emoji and movie title.';
    return;
  }

  if (remoteActive) {
    sendRemote({ type: 'addPuzzle', data: { emoji, answer } });
    newEmojiInput.value = '';
    newAnswerInput.value = '';
    feedbackEl.textContent = '✨ Puzzle submitted to the shared game.';
    return;
  }

  puzzles.push({ emoji, answer });
  saveToStorage();
  updateStats();
  showPuzzle(puzzles.length - 1);

  newEmojiInput.value = '';
  newAnswerInput.value = '';
  feedbackEl.textContent = '✨ Puzzle added! Now let someone else guess it.';
}

remoteSetupForm.addEventListener('submit', connectRemote);
checkGuessBtn.addEventListener('click', checkGuess);
showAnswerBtn.addEventListener('click', showAnswer);
nextPuzzleBtn.addEventListener('click', nextPuzzle);
addPuzzleForm.addEventListener('submit', addPuzzle);

loadFromStorage();
updateStats();
showPuzzle(getRandomIndex());
