import { GUESSING_MAX_TURNS, GUESSING_MIN_TARGET, GUESSING_MAX_TARGET } from './config.js';
import { fetchTemperature, initMap, setupCityInput } from './utils.js';

let secretNumber = 0;
let turnsLeft = GUESSING_MAX_TURNS;
let turnHistory = [];
let selectedCityData = null;
let isMapMode = false;
let myChart = null;

export function init(mode) {
    isMapMode = (mode === 'map');
    secretNumber = Math.floor(Math.random() * (GUESSING_MAX_TARGET - GUESSING_MIN_TARGET + 1)) + GUESSING_MIN_TARGET;
    turnsLeft = GUESSING_MAX_TURNS;
    turnHistory = [];
    selectedCityData = null;

    const input = document.getElementById('guessing-city-input');
    const btn = document.getElementById('guessing-submit-button');
    const mapContainer = document.getElementById('guessing-map-container');

    input.value = '';
    btn.disabled = true;
    
    document.getElementById('guessing-game-board').classList.remove('hidden');
    document.getElementById('guessing-end-screen').classList.add('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');

    if (isMapMode) {
        document.getElementById('guessing-mode-display').textContent = "Modus: Landkaart";
        mapContainer.classList.remove('hidden');
        input.readOnly = true;
        setTimeout(() => initMap('guessing', 'guessing-map', (city, label) => {
            selectedCityData = city;
            if(label) input.value = label;
            btn.disabled = !city;
        }), 100);
    } else {
        document.getElementById('guessing-mode-display').textContent = "Modus: Typen";
        mapContainer.classList.add('hidden');
        input.readOnly = false;
        setupCityInput('guessing-city-input', 'guessing-suggestions', 'guessing-submit-button', (city) => {
            selectedCityData = city;
        });
    }

    updateDisplay();
    renderHistory();

    btn.onclick = handleTurn;
    input.onkeypress = (e) => { if(e.key === 'Enter') handleTurn(); };
}

async function handleTurn() {
    if (turnsLeft === 0 || !selectedCityData) return;
    const resultDiv = document.getElementById('guessing-turn-result');

    if (turnHistory.some(t => t.country === selectedCityData.country)) {
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Al een stad in ${selectedCityData.country}!</span>`;
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

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : '❄️'}</span>
            <div><p><strong>${selectedCityData.name}</strong> is <strong>${temp}°C</strong>. Getal is <strong>${feedback}</strong></p></div>
        </div>`;
    resultDiv.classList.remove('hidden');
    
    selectedCityData = null;
    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;
    updateDisplay();
    renderHistory();
    if (temp === secretNumber) endGame(true);
    else if (turnsLeft === 0) endGame(false);
}

function updateDisplay() {
    document.getElementById('guessing-turns-display').textContent = `${turnsLeft}`;
    document.getElementById('guessing-target-display').textContent = "??";
}

function renderHistory() {
    const list = document.getElementById('guessing-history-log');
    list.innerHTML = '';
    turnHistory.slice().reverse().forEach((turn) => {
        const li = document.createElement('li');
        li.className = 'text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 rounded';
        li.innerHTML = `<span>${turn.name}</span> <span class="font-bold">${turn.temp}°C (${turn.feedback})</span>`;
        list.appendChild(li);
    });
    document.getElementById('guessing-history-placeholder').style.display = turnHistory.length ? 'none' : 'block';
}

function endGame(won) {
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');
    document.getElementById('guessing-end-title').textContent = won ? "GEVONDEN!" : "HELAAS!";
    document.getElementById('guessing-end-message').textContent = `Het getal was ${secretNumber}°C.`;

    if(won) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    // Stats
    let maxTemp = -999;
    let minTemp = 999;
    let maxCity = "-";
    let minCity = "-";

    const list = document.getElementById('guessing-summary-list');
    list.innerHTML = '';

    turnHistory.forEach(turn => {
        if(turn.temp > maxTemp) { maxTemp = turn.temp; maxCity = turn.name; }
        if(turn.temp < minTemp) { minTemp = turn.temp; minCity = turn.name; }

        const li = document.createElement('li');
        li.className = "flex justify-between border-b border-gray-100 pb-1";
        li.innerHTML = `<span>${turn.name}</span> <span class="font-bold">${turn.temp}°C (${turn.feedback})</span>`;
        list.appendChild(li);
    });

    document.getElementById('guess-stat-hot').textContent = maxCity !== "-" ? `${maxCity} (${maxTemp}°C)` : "-";
    document.getElementById('guess-stat-cold').textContent = minCity !== "-" ? `${minCity} (${minTemp}°C)` : "-";

    // Grafiek
    if(myChart) myChart.destroy();
    const ctx = document.getElementById('guessing-chart');
    
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
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}