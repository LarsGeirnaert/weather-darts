import { testApiConnection } from './utils.js';
import * as deductionGame from './game-deduction.js';
import * as guessingGame from './game-guessing.js';
import * as duelGame from './game-duel.js';
import * as millionaireGame from './game-millionaire.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Main.js geladen!");
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

    // DUEL
    const btnDuel = document.getElementById('btn-duel-text');
    if(btnDuel) btnDuel.addEventListener('click', () => startGame('duel', 'text'));

    // MILJONAIR (De knop die niet werkte)
    const btnMil = document.getElementById('btn-millionaire');
    if(btnMil) {
        console.log("💎 Miljonair knop gevonden!");
        btnMil.addEventListener('click', () => {
            console.log("💎 Start quiz...");
            startGame('millionaire', 'text');
        });
    } else {
        console.error("❌ Kan knop 'btn-millionaire' niet vinden!");
    }

    // Back Button
    const backBtn = document.getElementById('back-to-menu');
    if(backBtn) backBtn.addEventListener('click', () => location.reload());
});

function startGame(game, mode) {
    console.log(`🎮 Start spel: ${game}`);
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    // Verberg alle games
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
        duelGame.init();
        document.getElementById('duel-game').classList.remove('hidden');
    } else if (game === 'millionaire') {
        if(milGame) {
            millionaireGame.init();
            milGame.classList.remove('hidden');
        } else {
            alert("❌ Fout: Quiz scherm (id='millionaire-game') niet gevonden in HTML. Ververs de pagina!");
        }
    }
}