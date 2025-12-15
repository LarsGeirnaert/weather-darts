import { GUESSING_MAX_TURNS, GUESSING_MIN_TARGET, GUESSING_MAX_TARGET } from '../config.js';
import { fetchTemperature, initMap, setupCityInput, getFlagEmoji } from '../utils.js';

let secretNumber = 0;
let turnsLeft = GUESSING_MAX_TURNS;
let turnHistory = [];
let selectedCityData = null;
let isMapMode = false;
let myChart = null;

// FIX: Gebruik innerHTML zodat de vlag-code als plaatje wordt getoond
function safeSetText(id, html) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
}

export function init(mode) {
    isMapMode = (mode === 'map');
    secretNumber = Math.floor(Math.random() * (GUESSING_MAX_TARGET - GUESSING_MIN_TARGET + 1)) + GUESSING_MIN_TARGET;
    turnsLeft = GUESSING_MAX_TURNS;
    turnHistory = [];
    selectedCityData = null;

    const input = document.getElementById('guessing-city-input');
    const btn = document.getElementById('guessing-submit-button');
    const mapContainer = document.getElementById('guessing-map-container');

    if(input) input.value = '';
    if(btn) btn.disabled = true;

    document.getElementById('guessing-game-board').classList.remove('hidden');
    document.getElementById('guessing-end-screen').classList.add('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');

    if (isMapMode) {
        safeSetText('guessing-mode-display', "Modus: Landkaart");
        mapContainer.classList.remove('hidden');
        if(input) input.readOnly = true;
        setTimeout(() => initMap('guessing', 'guessing-map', (city, label) => {
            selectedCityData = city;
            if(label && input) input.value = label;
            if(btn) btn.disabled = !city;
        }), 100);
    } else {
        safeSetText('guessing-mode-display', "Modus: Typen");
        mapContainer.classList.add('hidden');
        if(input) input.readOnly = false;
        setupCityInput('guessing-city-input', 'guessing-suggestions', 'guessing-submit-button', (city) => {
            selectedCityData = city;
        });
    }

    updateDisplay();
    renderHistory();

    if(btn) btn.onclick = handleTurn;
    if(input) input.onkeypress = (e) => { if(e.key === 'Enter') handleTurn(); };
}

async function handleTurn() {
    if (turnsLeft === 0 || !selectedCityData) return;
    const resultDiv = document.getElementById('guessing-turn-result');

    // Check of stad al gekozen is (op basis van naam + land)
    if (turnHistory.some(t => t.name === selectedCityData.name && t.country === selectedCityData.country)) {
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Je hebt deze stad al gegokt!</span>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    const temp = await fetchTemperature(selectedCityData, resultDiv);
    if (temp === null) return;

    let feedback = 'LAGER';
    if (temp === secretNumber) { feedback = 'GEWONNEN!'; }
    else if (temp < secretNumber) feedback = 'HOGER';

    turnsLeft--;
    turnHistory.push({ name: selectedCityData.name, country: selectedCityData.country, temp, feedback });

    const flag = getFlagEmoji(selectedCityData.country);

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : '❄️'}</span>
            <div><p><strong>${selectedCityData.name} ${flag}</strong> is <strong>${temp}°C</strong>. Getal is <strong>${feedback}</strong></p></div>
        </div>`;
    resultDiv.classList.remove('hidden');

    selectedCityData = null;
    const input = document.getElementById('guessing-city-input');
    if(input) input.value = '';
    const btn = document.getElementById('guessing-submit-button');
    if(btn) btn.disabled = true;

    updateDisplay();
    renderHistory();
    if (temp === secretNumber) endGame(true);
    else if (turnsLeft === 0) endGame(false);
}

function updateDisplay() {
    safeSetText('guessing-turns-display', `${turnsLeft}`);
    safeSetText('guessing-target-display', "??");
}

function renderHistory() {
    const list = document.getElementById('guessing-history-log');
    if(!list) return;

    list.innerHTML = '';
    turnHistory.slice().reverse().forEach((turn) => {
        const li = document.createElement('li');
        const flag = getFlagEmoji(turn.country);
        li.className = 'text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 rounded';
        li.innerHTML = `<span>${turn.name} ${flag}</span> <span class="font-bold">${turn.temp}°C (${turn.feedback})</span>`;
        list.appendChild(li);
    });
    const placeholder = document.getElementById('guessing-history-placeholder');
    if(placeholder) placeholder.style.display = turnHistory.length ? 'none' : 'block';
}

function endGame(won) {
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');

    safeSetText('guessing-end-title', won ? "GEVONDEN!" : "HELAAS!");
    safeSetText('guessing-end-message', `Het getal was ${secretNumber}°C.`);

    if(won && typeof confetti === "function") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    let maxTemp = -999;
    let minTemp = 999;
    let maxCity = "-";
    let minCity = "-";

    const list = document.getElementById('guessing-summary-list');
    if(list) {
        list.innerHTML = '';
        turnHistory.forEach(turn => {
            const flag = getFlagEmoji(turn.country);
            // Bouw de string met HTML voor de statistieken
            if(turn.temp > maxTemp) { maxTemp = turn.temp; maxCity = `${turn.name} ${flag}`; }
            if(turn.temp < minTemp) { minTemp = turn.temp; minCity = `${turn.name} ${flag}`; }

            const li = document.createElement('li');
            li.className = "flex justify-between border-b border-gray-100 pb-1";
            li.innerHTML = `<span>${turn.name} ${flag}</span> <span class="font-bold">${turn.temp}°C (${turn.feedback})</span>`;
            list.appendChild(li);
        });
    }

    // Hier wordt nu innerHTML gebruikt via safeSetText, dus de vlaggen werken!
    safeSetText('guess-stat-hot', maxCity !== "-" ? `${maxCity} (${maxTemp}°C)` : "-");
    safeSetText('guess-stat-cold', minCity !== "-" ? `${minCity} (${minTemp}°C)` : "-");

    const ctx = document.getElementById('guessing-chart');
    if(ctx) {
        if(myChart) myChart.destroy();
        // Voor de grafiek strippen we de vlaggen (Chart.js ondersteunt geen HTML)
        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: turnHistory.map(t => t.name),
                datasets: [{
                    label: 'Gekozen Temperatuur',
                    data: turnHistory.map(t => t.temp),
                    backgroundColor: turnHistory.map(t => t.temp === secretNumber ? '#22c55e' : '#3b82f6'),
                }, {
                    type: 'line',
                    label: 'Doel',
                    data: Array(turnHistory.length).fill(secretNumber),
                    borderColor: '#ef4444',
                    borderDash: [5, 5],
                    pointRadius: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}