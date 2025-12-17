import { fetchTemperature, setupCityInput, initMap, triggerWinConfetti } from '../utils.js';

let targetNumber = 0;
let turnsLeft = 7;
let gameMode = 'text';
let history = [];
let minBound = 5;
let maxBound = 30;

export function init(mode) {
    console.log("🔍 Guessing Game Init: " + mode);
    gameMode = mode;
    
    // RESTART KNOP FIX
    const restartBtn = document.getElementById('guessing-restart-btn');
    if (restartBtn) {
        restartBtn.onclick = function() {
            init(gameMode);
        };
    }

    resetGame();
}

function resetGame() {
    turnsLeft = 7;
    history = [];
    minBound = 5;
    maxBound = 30;
    targetNumber = Math.floor(Math.random() * (maxBound - minBound + 1)) + minBound; 

    document.getElementById('guessing-game-board').classList.remove('hidden');
    document.getElementById('guessing-end-screen').classList.add('hidden');
    
    document.getElementById('guessing-target-display').innerText = "??";
    document.getElementById('guessing-turns-display').innerText = turnsLeft;
    document.getElementById('guessing-mode-display').innerText = `Modus: ${gameMode === 'text' ? 'Tekst invoer' : 'Interactieve Kaart'}`;
    
    document.getElementById('guessing-history-log').innerHTML = '';
    document.getElementById('guessing-history-placeholder').classList.remove('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');
    
    const input = document.getElementById('guessing-city-input');
    const btn = document.getElementById('guessing-submit-button');
    if(input) { input.value = ''; input.disabled = false; }
    if(btn) { btn.disabled = true; }

    // AUTOFILL SETUP AANROEPEN
    setupGameElements();

    if (gameMode === 'map') {
        document.getElementById('guessing-map-container').classList.remove('hidden');
        const inputContainer = document.getElementById('guessing-city-input').parentElement;
        if(inputContainer) inputContainer.classList.add('hidden');
        
        initMap('guessing', 'guessing-map', (cityData, label) => {
            handleGuess(cityData);
        });
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 200);
    } else {
        document.getElementById('guessing-map-container').classList.add('hidden');
        const inputContainer = document.getElementById('guessing-city-input').parentElement;
        if(inputContainer) inputContainer.classList.remove('hidden');
    }
}

function setupGameElements() {
    // Koppel de autocomplete aan de input van deze game
    setupCityInput('guessing-city-input', 'guessing-suggestions', 'guessing-submit-button', (cityData) => {
        if(cityData) handleGuess(cityData);
    });
}

async function handleGuess(cityData) {
    if (!cityData || turnsLeft <= 0) return;

    const resultDiv = document.getElementById('guessing-turn-result');
    resultDiv.innerHTML = `<div class="animate-pulse">🌡️ Checken... ${cityData.name}</div>`;
    resultDiv.classList.remove('hidden');

    const temp = await fetchTemperature(cityData, resultDiv);
    
    if (temp !== null) {
        processTurn(cityData.name, temp);
    }
}

function processTurn(cityName, temp) {
    turnsLeft--;
    document.getElementById('guessing-turns-display').innerText = turnsLeft;

    let feedback = "";
    let colorClass = "text-slate-600";

    if (temp === targetNumber) {
        feedback = "CORRECT! 🎉";
        colorClass = "text-green-600";
    } else if (temp < targetNumber) {
        feedback = "Te Koud (Hoger!) ⬆️";
        colorClass = "text-blue-500";
    } else {
        feedback = "Te Warm (Lager!) ⬇️";
        colorClass = "text-red-500";
    }

    const resultDiv = document.getElementById('guessing-turn-result');
    resultDiv.innerHTML = `
        <div class="text-center">
            <span class="block text-xs text-slate-400 uppercase font-bold">${cityName}</span>
            <span class="text-3xl font-black ${colorClass}">${temp}°C</span>
            <div class="text-lg font-bold mt-1">${feedback}</div>
        </div>
    `;

    addToHistory(cityName, temp, feedback);

    if (temp === targetNumber) {
        finishGame('win');
    } else if (turnsLeft <= 0) {
        finishGame('lose');
    }
}

function addToHistory(city, temp, feedback) {
    const list = document.getElementById('guessing-history-log');
    document.getElementById('guessing-history-placeholder').classList.add('hidden');
    
    const item = document.createElement('li');
    item.className = "flex justify-between items-center text-sm p-2 bg-white rounded border border-slate-100";
    item.innerHTML = `<span>${city} (${temp}°C)</span> <span class="font-bold text-xs">${feedback}</span>`;
    list.prepend(item);
}

function finishGame(result) {
    const endScreen = document.getElementById('guessing-end-screen');
    const board = document.getElementById('guessing-game-board');
    const title = document.getElementById('guessing-end-title');
    const msg = document.getElementById('guessing-end-message');
    
    board.classList.add('hidden');
    endScreen.classList.remove('hidden');

    if (result === 'win') {
        title.innerText = "GEWONNEN!";
        title.className = "text-5xl font-black mb-2 text-green-500";
        msg.innerText = `Je hebt het getal ${targetNumber} gevonden!`;
        triggerWinConfetti();
    } else {
        title.innerText = "Helaas...";
        title.className = "text-5xl font-black mb-2 text-slate-700";
        msg.innerText = `Het getal was ${targetNumber}.`;
    }
}