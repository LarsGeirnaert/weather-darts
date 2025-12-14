import { testApiConnection } from './utils.js';
import * as DeductionGame from './game-deduction.js';
import * as GuessingGame from './game-guessing.js';
import * as DuelGame from './game-duel.js';

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const backButton = document.getElementById('back-to-menu');

// Navigatie Functies
function showMenu() {
    mainMenu.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    document.getElementById('deduction-game').classList.add('hidden');
    document.getElementById('guessing-game').classList.add('hidden');
    document.getElementById('duel-game').classList.add('hidden');
}

function showGame(gameId) {
    mainMenu.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    document.getElementById(gameId).classList.remove('hidden');
}

async function handleGameStart(type, mode) {
    const isConnected = await testApiConnection();
    if (!isConnected) return;

    if (type === 'deduction') {
        showGame('deduction-game');
        DeductionGame.init(mode);
    } else if (type === 'guessing') {
        showGame('guessing-game');
        GuessingGame.init(mode);
    } else if (type === 'duel') {
        showGame('duel-game');
        DuelGame.init();
    }
}

// Event Listeners voor Menu Knoppen
document.getElementById('btn-deduction-text').onclick = () => handleGameStart('deduction', 'text');
document.getElementById('btn-deduction-map').onclick = () => handleGameStart('deduction', 'map');

document.getElementById('btn-guessing-text').onclick = () => handleGameStart('guessing', 'text');
document.getElementById('btn-guessing-map').onclick = () => handleGameStart('guessing', 'map');

document.getElementById('btn-duel-text').onclick = () => handleGameStart('duel', 'text');

// Back Button
backButton.onclick = showMenu;

// Init Check
testApiConnection();