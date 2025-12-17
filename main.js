import { testApiConnection } from './utils.js';
import * as deductionGame from './games/game-deduction.js';
import * as guessingGame from './games/game-guessing.js';
import * as duelGame from './games/game-duel.js';
import * as duelLandGame from './games/game-duel-land.js'; // NIEUWE IMPORT
import * as millionaireGame from './games/game-millionaire.js';

function initBackgroundEffects() {
    const icons = ['❄️', '☀️', '☁️', '⚡', '🌈', '🌧️', '🌪️'];
    const container = document.body;
    const particleCount = 15;

    for (let i = 0; i < particleCount; i++) {
        const span = document.createElement('span');
        span.textContent = icons[Math.floor(Math.random() * icons.length)];
        span.className = 'weather-particle';
        span.style.left = Math.random() * 100 + 'vw';
        span.style.animationDuration = (Math.random() * 10 + 10) + 's';
        span.style.animationDelay = (Math.random() * 10) + 's';
        span.style.fontSize = (Math.random() * 2 + 1) + 'rem';
        container.appendChild(span);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Main.js geladen!");
    initBackgroundEffects();
    await testApiConnection();

    // DEDUCTION
    const btnDedText = document.getElementById('btn-deduction-text');
    const btnDedMap = document.getElementById('btn-deduction-map');
    if(btnDedText) btnDedText.addEventListener('click', () => startGame('deduction', 'text'));
    if(btnDedMap) btnDedMap.addEventListener('click', () => startGame('deduction', 'map'));

    // GUESSING
    const btnGuessText = document.getElementById('btn-guessing-text');
    const btnGuessMap = document.getElementById('btn-guessing-map');
    if(btnGuessText) btnGuessText.addEventListener('click', () => startGame('guessing', 'text'));
    if(btnGuessMap) btnGuessMap.addEventListener('click', () => startGame('guessing', 'map'));

    // DUEL (Steden & Landen)
    const btnDuelText = document.getElementById('btn-duel-text');
    const btnDuelLand = document.getElementById('btn-duel-land'); // De nieuwe knop
    
    if(btnDuelText) btnDuelText.addEventListener('click', () => startGame('duel', 'text'));
    if(btnDuelLand) btnDuelLand.addEventListener('click', () => startGame('duel-land', 'text'));

    // MILJONAIR
    const btnMil = document.getElementById('btn-millionaire');
    if(btnMil) btnMil.addEventListener('click', () => startGame('millionaire', 'text'));

    // Back Button
    const backBtn = document.getElementById('back-to-menu');
    if(backBtn) backBtn.addEventListener('click', () => location.reload());
});

function startGame(game, mode) {
    console.log(`🎮 Start spel: ${game}`);
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    document.getElementById('deduction-game').classList.add('hidden');
    document.getElementById('guessing-game').classList.add('hidden');
    document.getElementById('duel-game').classList.add('hidden');
    
    const milGame = document.getElementById('millionaire-game');
    if(milGame) milGame.classList.add('hidden');

    if (game === 'deduction') {
        deductionGame.init(mode);
        document.getElementById('deduction-game').classList.remove('hidden');
    } else if (game === 'guessing') {
        guessingGame.init(mode);
        document.getElementById('guessing-game').classList.remove('hidden');
    } else if (game === 'duel') {
        duelGame.init(); // Steden
        document.getElementById('duel-game').classList.remove('hidden');
    } else if (game === 'duel-land') {
        duelLandGame.init(); // Landen
        document.getElementById('duel-game').classList.remove('hidden');
    } else if (game === 'millionaire') {
        if(milGame) {
            millionaireGame.init();
            milGame.classList.remove('hidden');
        }
    }
}