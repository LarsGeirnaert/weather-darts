import { fetchTemperature, setupCityInput, initMap, triggerWinConfetti } from '../utils.js';

let currentTarget = 0;
let turnsLeft = 5;
let gameMode = 'text'; // 'text' or 'map'
let history = [];

export function init(mode) {
    console.log("📉 Deduction Game Init: " + mode);
    gameMode = mode;
    
    // RESTART KNOP FIX
    const restartBtn = document.getElementById('deduction-restart-btn');
    if (restartBtn) {
        // Directe assignatie werkt beter dan replaceChild als de DOM dynamisch is
        restartBtn.onclick = function() {
            init(gameMode); 
        };
    }

    resetGame();
}

function resetGame() {
    turnsLeft = 5;
    history = [];
    currentTarget = Math.floor(Math.random() * 100) + 25; 

    // UI Reset
    document.getElementById('deduction-game-board').classList.remove('hidden');
    document.getElementById('deduction-end-screen').classList.add('hidden');
    
    const resDiv = document.getElementById('deduction-turn-result');
    resDiv.classList.add('hidden');
    resDiv.innerHTML = '';

    document.getElementById('deduction-target-display').innerText = `${currentTarget}°C`;
    document.getElementById('deduction-turns-display').innerText = turnsLeft;
    document.getElementById('deduction-mode-display').innerText = `Modus: ${gameMode === 'text' ? 'Tekst invoer' : 'Interactieve Kaart'}`;
    
    document.getElementById('deduction-history-log').innerHTML = '';
    document.getElementById('deduction-history-placeholder').classList.remove('hidden');
    
    const input = document.getElementById('deduction-city-input');
    const btn = document.getElementById('deduction-submit-button');
    if(input) { input.value = ''; input.disabled = false; }
    if(btn) { btn.disabled = true; }

    // AUTOFILL SETUP AANROEPEN
    setupGameElements();

    if (gameMode === 'map') {
        document.getElementById('deduction-map-container').classList.remove('hidden');
        const inputContainer = document.getElementById('deduction-city-input').parentElement;
        if(inputContainer) inputContainer.classList.add('hidden');
        
        initMap('deduction', 'deduction-map', (cityData, label) => {
            handleGuess(cityData);
        });
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 200);
    } else {
        document.getElementById('deduction-map-container').classList.add('hidden');
        const inputContainer = document.getElementById('deduction-city-input').parentElement;
        if(inputContainer) inputContainer.classList.remove('hidden');
    }
}

function setupGameElements() {
    // Koppel de autocomplete aan de input van deze game
    setupCityInput('deduction-city-input', 'deduction-suggestions', 'deduction-submit-button', (cityData) => {
        if(cityData) handleGuess(cityData);
    });
}

async function handleGuess(cityData) {
    if (!cityData || turnsLeft <= 0) return;

    const resultDiv = document.getElementById('deduction-turn-result');
    resultDiv.innerHTML = `<div class="animate-pulse">🌡️ Weer ophalen voor ${cityData.name}...</div>`;
    resultDiv.classList.remove('hidden');

    const temp = await fetchTemperature(cityData, resultDiv);
    
    if (temp !== null) {
        processTurn(cityData.name, temp);
    }
}

function processTurn(cityName, temp) {
    const oldTarget = currentTarget;
    currentTarget = currentTarget - temp;
    turnsLeft--;

    document.getElementById('deduction-target-display').innerText = `${currentTarget.toFixed(1)}°C`;
    document.getElementById('deduction-turns-display').innerText = turnsLeft;

    const resultDiv = document.getElementById('deduction-turn-result');
    resultDiv.innerHTML = `
        <div class="text-center">
            <span class="block text-xs text-slate-400 uppercase font-bold">${cityName}</span>
            <span class="text-3xl font-black text-indigo-600">${temp}°C</span>
            <div class="text-sm mt-1 text-slate-600">${oldTarget} - ${temp} = <strong>${currentTarget}</strong></div>
        </div>
    `;

    addToHistory(cityName, temp, currentTarget);

    if (Math.round(currentTarget) === 0) { 
        finishGame('win');
    } else if (turnsLeft <= 0) {
        finishGame('lose');
    }
}

function addToHistory(city, temp, result) {
    const list = document.getElementById('deduction-history-log');
    document.getElementById('deduction-history-placeholder').classList.add('hidden');
    
    const item = document.createElement('li');
    item.className = "flex justify-between items-center text-sm p-2 bg-white rounded border border-slate-100";
    item.innerHTML = `<span>${city} (${temp}°C)</span> <span class="font-bold text-indigo-600">→ ${result.toFixed(1)}</span>`;
    list.prepend(item);
    
    history.push({ city, temp, result });
}

function finishGame(result) {
    const endScreen = document.getElementById('deduction-end-screen');
    const board = document.getElementById('deduction-game-board');
    const title = document.getElementById('deduction-end-title');
    const msg = document.getElementById('deduction-end-message');
    
    board.classList.add('hidden');
    endScreen.classList.remove('hidden');

    if (result === 'win') {
        title.innerText = "🏆 PERFECT!";
        title.className = "text-5xl font-black mb-2 text-yellow-500";
        msg.innerText = "Je bent precies op 0°C uitgekomen!";
        triggerWinConfetti();
    } else {
        const diff = Math.abs(currentTarget);
        title.innerText = "Afgelopen";
        title.className = "text-5xl font-black mb-2 text-slate-700";
        msg.innerText = `Je eindigde op ${currentTarget.toFixed(1)}°C (${diff.toFixed(1)} graden ernaast).`;
    }
}