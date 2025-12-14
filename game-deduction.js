import { DEDUCTION_MAX_TURNS, DEDUCTION_MIN_TARGET, DEDUCTION_MAX_TARGET } from './config.js';
import { fetchTemperature, initMap, setupCityInput } from './utils.js';

let targetTemp = 0;
let initialTarget = 0;
let turnsLeft = DEDUCTION_MAX_TURNS;
let turnHistory = [];
let selectedCityData = null;
let isMapMode = false;
let myChart = null; // Voor de grafiek

export function init(mode) {
    isMapMode = (mode === 'map');
    targetTemp = Math.floor(Math.random() * (DEDUCTION_MAX_TARGET - DEDUCTION_MIN_TARGET + 1)) + DEDUCTION_MIN_TARGET;
    initialTarget = targetTemp;
    turnsLeft = DEDUCTION_MAX_TURNS;
    turnHistory = [];
    selectedCityData = null;

    const input = document.getElementById('deduction-city-input');
    const btn = document.getElementById('deduction-submit-button');
    const mapContainer = document.getElementById('deduction-map-container');
    
    input.value = '';
    btn.disabled = true;
    
    document.getElementById('deduction-game-board').classList.remove('hidden');
    document.getElementById('deduction-end-screen').classList.add('hidden');
    document.getElementById('deduction-turn-result').classList.add('hidden');

    if (isMapMode) {
        document.getElementById('deduction-mode-display').textContent = "Modus: Landkaart";
        mapContainer.classList.remove('hidden');
        input.readOnly = true;
        setTimeout(() => initMap('deduction', 'deduction-map', (city, label) => {
            selectedCityData = city;
            if(label) input.value = label;
            btn.disabled = !city;
        }), 100);
    } else {
        document.getElementById('deduction-mode-display').textContent = "Modus: Typen";
        mapContainer.classList.add('hidden');
        input.readOnly = false;
        setupCityInput('deduction-city-input', 'deduction-suggestions', 'deduction-submit-button', (city) => {
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
    const resultDiv = document.getElementById('deduction-turn-result');

    if (turnHistory.some(t => t.country === selectedCityData.country)) {
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Al een stad in ${selectedCityData.country}!</span>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    const temp = await fetchTemperature(selectedCityData, resultDiv);
    if (temp === null) return;

    const oldTarget = targetTemp;
    targetTemp -= temp;
    turnsLeft--;
    turnHistory.push({ name: selectedCityData.name, country: selectedCityData.country, temp: temp, remaining: targetTemp });

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : temp < 5 ? '❄️' : '☁️'}</span>
            <div><p><strong>${selectedCityData.name}</strong>: <strong>${temp}°C</strong></p><p>Nieuw Doel: ${oldTarget} - ${temp} = <strong>${targetTemp}°C</strong></p></div>
        </div>`;
    resultDiv.classList.remove('hidden');
    
    selectedCityData = null;
    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;
    updateDisplay();
    renderHistory();
    if (targetTemp <= 0 || turnsLeft === 0) endGame();
}

function updateDisplay() {
    document.getElementById('deduction-target-display').textContent = `${targetTemp}°C`;
    document.getElementById('deduction-turns-display').textContent = `${turnsLeft}`;
}

function renderHistory() {
    const list = document.getElementById('deduction-history-log');
    list.innerHTML = '';
    turnHistory.slice().reverse().forEach((turn) => {
        const li = document.createElement('li');
        li.className = 'text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 border-red-400 rounded';
        li.innerHTML = `<span>${turn.name}, ${turn.country}</span> <span class="font-bold">${turn.temp}°C</span>`;
        list.appendChild(li);
    });
    document.getElementById('deduction-history-placeholder').style.display = turnHistory.length ? 'none' : 'block';
}

function endGame() {
    document.getElementById('deduction-game-board').classList.add('hidden');
    document.getElementById('deduction-end-screen').classList.remove('hidden');
    const msg = document.getElementById('deduction-end-message');
    const title = document.getElementById('deduction-end-title');
    
    if (targetTemp === 0) { 
        title.textContent = "🏆 PERFECT!"; msg.textContent = "Precies 0!"; 
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    else if (targetTemp > 0) { title.textContent = "Game Over"; msg.textContent = `Score: ${targetTemp}`; }
    else { title.textContent = "Onder Nul!"; msg.textContent = `Eind: ${targetTemp}`; }

    // Lijst vullen
    const list = document.getElementById('deduction-summary-list');
    list.innerHTML = '';
    turnHistory.forEach((turn, index) => {
        const li = document.createElement('li');
        li.className = "flex justify-between border-b border-gray-100 pb-1";
        li.innerHTML = `<span>${index+1}. ${turn.name} (${turn.temp}°C)</span> <span>Over: <strong>${turn.remaining}°C</strong></span>`;
        list.appendChild(li);
    });

    // Grafiek Tekenen
    if(myChart) myChart.destroy();
    
    const ctx = document.getElementById('deduction-chart');
    const labels = ['Start', ...turnHistory.map((_, i) => `Beurt ${i+1}`)];
    const dataPoints = [initialTarget, ...turnHistory.map(t => t.remaining)];

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperatuur tot 0',
                data: dataPoints,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, suggestedMin: 0 }
            }
        }
    });
}