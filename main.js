import { testApiConnection } from './utils.js';
import * as deductionGame from './games/game-deduction.js';
import * as guessingGame from './games/game-guessing.js';
import * as duelGame from './games/game-duel.js';
import * as duelLandGame from './games/game-duel-land.js';
import * as pathGame from './games/game-path.js';
import * as higherLowerGame from './games/quiz/game-higherlower.js';
import * as millionaireGame from './games/quiz/game-millionaire.js';

function initBackgroundEffects() {
    const icons = ['❄️', '☀️', '☁️', '⚡', '🌈', '🌧️', '🌪️'];
    const container = document.body;
    for (let i = 0; i < 15; i++) {
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

    // Event Listeners (Menu)
    const setupListener = (id, func) => {
        const el = document.getElementById(id);
        if (el) el.onclick = func;
    };

    setupListener('btn-deduction-text', () => startGame('deduction', 'text'));
    setupListener('btn-deduction-map', () => startGame('deduction', 'map'));
    setupListener('btn-guessing-text', () => startGame('guessing', 'text'));
    setupListener('btn-guessing-map', () => startGame('guessing', 'map'));
    setupListener('btn-duel-text', () => startGame('duel', 'text'));
    setupListener('btn-duel-land', () => startGame('duel-land', 'text'));
    setupListener('btn-path-solo', () => startGame('path', 'solo'));
    setupListener('btn-path-online', () => startGame('path', 'online'));
    setupListener('btn-higherlower', () => startGame('higherlower'));
    setupListener('btn-millionaire', () => startGame('millionaire'));

    // Back Button (Reload is veiligste optie om alles te resetten)
    setupListener('back-to-menu', () => location.reload());
});

function startGame(game, mode) {
    console.log(`🎮 Start spel: ${game} (${mode})`);
    
    // Verberg Menu
    document.getElementById('main-menu').classList.add('hidden');
    
    // Toon Container
    const container = document.getElementById('game-container');
    container.classList.remove('hidden');
    
    // Reset Millionaire Mode Style
    container.classList.remove('millionaire-mode'); 

    // Verberg alle games
    const games = ['deduction-game', 'guessing-game', 'duel-game', 'path-game', 'higherlower-game', 'millionaire-game'];
    games.forEach(id => document.getElementById(id).classList.add('hidden'));

    // Start specifieke game
    if (game === 'deduction') {
        deductionGame.init(mode);
        document.getElementById('deduction-game').classList.remove('hidden');
    } else if (game === 'guessing') {
        guessingGame.init(mode);
        document.getElementById('guessing-game').classList.remove('hidden');
    } else if (game === 'duel') {
        duelGame.init();
        document.getElementById('duel-game').classList.remove('hidden');
    } else if (game === 'duel-land') {
        duelLandGame.init();
        document.getElementById('duel-game').classList.remove('hidden');
    } else if (game === 'path') {
        pathGame.init(mode);
        document.getElementById('path-game').classList.remove('hidden');
    } else if (game === 'higherlower') {
        higherLowerGame.init();
        document.getElementById('higherlower-game').classList.remove('hidden');
    } else if (game === 'millionaire') {
        container.classList.add('millionaire-mode'); // ACTIVATE DARK THEME
        millionaireGame.init();
        document.getElementById('millionaire-game').classList.remove('hidden');
    }
}