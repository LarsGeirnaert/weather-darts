// **********************************************
// ********** 1. CONFIGURATIE & STATUS **********
// **********************************************

const API_KEY = "b10dc274a5e56f6f6fc4fe68a7987217";
const GEO_API_URL = "https://api.openweathermap.org/geo/1.0/direct";
const FORECAST_API_URL = "https://api.openweathermap.org/data/2.5/forecast";
const REVERSE_GEO_API_URL = "https://api.openweathermap.org/geo/1.0/reverse";

// --- Spel parameters ---
const DEDUCTION_MAX_TURNS = 5;
const DEDUCTION_MIN_TARGET = 25;
const DEDUCTION_MAX_TARGET = 125;

const GUESSING_MAX_TURNS = 7;
const GUESSING_MIN_TARGET = 5;
const GUESSING_MAX_TARGET = 30;
const DEBOUNCE_DELAY = 300;

// --- Globale Status ---
let currentGameType = ''; 
let currentInputMode = ''; 
let gameActive = false;
let debounceTimer;

// State Spel 1 (Deduction)
let deductionTargetTemp = 0;
let deductionTurnsLeft = DEDUCTION_MAX_TURNS;
let deductionTurnHistory = [];
let deductionSelectedCityData = null;

// State Spel 2 (Guessing)
let guessingSecretNumber = 0;
let guessingTurnsLeft = GUESSING_MAX_TURNS;
let guessingTurnHistory = [];
let guessingSelectedCityData = null;

// Kaart variabelen
let mapInstances = {}; 
let mapMarkers = {};   

// --- DOM Elementen ---
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const statusMessage = document.getElementById('status-message');

// **********************************************
// ********** 2. API & HELPER FUNCTIES **********
// **********************************************

// Automatische Landnamen Vertaler
const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });

function getCountryName(code) {
    try {
        return regionNames.of(code);
    } catch (e) {
        return code; 
    }
}

async function testApiConnection() {
    statusMessage.textContent = "🔬 Verbinding testen...";
    statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-blue-100 text-blue-700 text-sm";
    const testParams = new URLSearchParams({ q: "London", limit: 1, appid: API_KEY }).toString();
    try {
        const response = await fetch(`${GEO_API_URL}?${testParams}`);
        if (response.status === 200) {
            statusMessage.textContent = "✅ Klaar om te spelen!";
            statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-green-100 text-green-700 text-sm";
            return true;
        }
        return false;
    } catch { return false; }
}

// *** AANGEPASTE FUNCTIE: NU MAX TEMPERATUUR ***
async function fetchTemperature(cityData, resultElement) {
    const forecastParams = new URLSearchParams({ lat: cityData.lat, lon: cityData.lon, appid: API_KEY, units: 'metric' }).toString();
    try {
        const response = await fetch(`${FORECAST_API_URL}?${forecastParams}`);
        const data = await response.json();
        if (response.status !== 200) throw new Error("API Fout");

        // We zoeken de datum van de eerste meting (vandaag)
        const todayDate = data.list[0].dt_txt.slice(0, 10);
        
        let maxTemp = -Infinity; // Start extreem laag
        let found = false;

        // Loop door de voorspellingen
        for (const item of data.list) {
            // Als de datum overeenkomt met vandaag
            if (item.dt_txt.startsWith(todayDate)) {
                // Is deze temperatuur hoger dan wat we tot nu toe hebben?
                if (item.main.temp > maxTemp) {
                    maxTemp = item.main.temp;
                }
                found = true;
            }
        }

        // Als er geen data voor vandaag is gevonden (zou niet moeten gebeuren), return null
        if (!found) return null;

        // Return de hoogste temperatuur, afgerond
        return Math.round(maxTemp);

    } catch (error) {
        resultElement.innerHTML = `<span class="text-red-500">❌ Fout bij ophalen weergegevens.</span>`;
        return null;
    }
}

// --- Autocomplete (Tekst Modus) ---
async function fetchCitySuggestions(query, callback) {
    const params = new URLSearchParams({ q: query, limit: 2, appid: API_KEY }).toString();
    try {
        const response = await fetch(`${GEO_API_URL}?${params}`);
        callback(await response.json());
    } catch { callback([]); }
}

function renderSuggestions(cities, container, submitButton, setCityData) {
    container.innerHTML = '';
    const seen = new Set();
    submitButton.disabled = true;

    if (cities.length === 0) { container.classList.add('hidden'); submitButton.disabled = false; return; }

    cities.forEach(city => {
        const key = `${city.name}-${city.country}`;
        if (seen.has(key)) return;
        seen.add(key);

        const div = document.createElement('div');
        const country = getCountryName(city.country); 
        const displayName = `${city.name}, ${country}`;
        div.textContent = displayName;
        div.className = 'suggestion-item';
        div.onclick = () => {
            container.previousElementSibling.value = displayName;
            container.classList.add('hidden');
            setCityData({ name: city.name, country: country, lat: city.lat, lon: city.lon });
            submitButton.disabled = false;
        };
        container.appendChild(div);
    });
    container.classList.remove('hidden');
}

function handleCityInput(event, gameType) {
    clearTimeout(debounceTimer);
    let input, container, btn, callback, setter;

    if (gameType === 'deduction') {
        input = document.getElementById('deduction-city-input');
        container = document.getElementById('deduction-suggestions');
        btn = document.getElementById('deduction-submit-button');
        callback = (c) => renderSuggestions(c, container, btn, (city) => deductionSelectedCityData = city);
        setter = (c) => deductionSelectedCityData = c;
    } else {
        input = document.getElementById('guessing-city-input');
        container = document.getElementById('guessing-suggestions');
        btn = document.getElementById('guessing-submit-button');
        callback = (c) => renderSuggestions(c, container, btn, (city) => guessingSelectedCityData = city);
        setter = (c) => guessingSelectedCityData = c;
    }

    const query = event.target.value.trim();
    setter(null);
    btn.disabled = true;

    if (query.length < 3) { container.classList.add('hidden'); btn.disabled = false; return; }
    debounceTimer = setTimeout(() => fetchCitySuggestions(query, callback), DEBOUNCE_DELAY);
}

// **********************************************
// ********** 3. KAART LOGICA (LEAFLET) *********
// **********************************************

function initMap(gameType) {
    const mapId = gameType === 'deduction' ? 'deduction-map' : 'guessing-map';
    
    if (mapInstances[gameType]) {
        mapInstances[gameType].invalidateSize(); 
        return;
    }

    const map = L.map(mapId).setView([52.0, 5.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', (e) => onMapClick(e, gameType));
    mapInstances[gameType] = map;
}

async function onMapClick(e, gameType) {
    if (!gameActive) return;

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    const map = mapInstances[gameType];

    if (mapMarkers[gameType]) map.removeLayer(mapMarkers[gameType]);
    mapMarkers[gameType] = L.marker([lat, lon]).addTo(map);

    const inputId = gameType === 'deduction' ? 'deduction-city-input' : 'guessing-city-input';
    const btnId = gameType === 'deduction' ? 'deduction-submit-button' : 'guessing-submit-button';

    document.getElementById(inputId).value = "Locatie zoeken...";
    document.getElementById(btnId).disabled = true;

    const params = new URLSearchParams({ lat: lat, lon: lon, limit: 1, appid: API_KEY }).toString();
    
    try {
        const response = await fetch(`${REVERSE_GEO_API_URL}?${params}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const place = data[0];
            const country = getCountryName(place.country); 
            const cityData = { name: place.name, country: country, lat: place.lat, lon: place.lon };

            document.getElementById(inputId).value = `${place.name}, ${country}`;
            
            if (gameType === 'deduction') {
                deductionSelectedCityData = cityData;
            } else {
                guessingSelectedCityData = cityData;
            }

            document.getElementById(btnId).disabled = false;
        } else {
            document.getElementById(inputId).value = "Geen stad gevonden (oceaan?).";
        }
    } catch (err) {
        console.error(err);
    }
}

// **********************************************
// ********** 4. SPEL 1: DEDUCTIE LOGICA ********
// **********************************************

function initializeDeductionGame() {
    deductionTargetTemp = Math.floor(Math.random() * (DEDUCTION_MAX_TARGET - DEDUCTION_MIN_TARGET + 1)) + DEDUCTION_MIN_TARGET;
    deductionTurnsLeft = DEDUCTION_MAX_TURNS;
    gameActive = true;
    deductionTurnHistory = [];
    deductionSelectedCityData = null;

    const input = document.getElementById('deduction-city-input');
    const btn = document.getElementById('deduction-submit-button');
    const mapContainer = document.getElementById('deduction-map-container');
    const modeDisplay = document.getElementById('deduction-mode-display');

    input.value = '';
    btn.disabled = true;
    btn.textContent = "Trek Temperatuur Af";
    
    if (currentInputMode === 'map') {
        modeDisplay.textContent = "Modus: Landkaart";
        mapContainer.classList.remove('hidden'); 
        input.readOnly = true; 
        input.placeholder = "Klik op de kaart om een stad te kiezen...";
        setTimeout(() => initMap('deduction'), 100);
    } else {
        modeDisplay.textContent = "Modus: Typen";
        mapContainer.classList.add('hidden'); 
        input.readOnly = false; 
        input.placeholder = "Typ een stad (bv. Parijs)...";
    }

    updateDeductionDisplay();
    renderDeductionHistory();

    document.getElementById('deduction-game-board').classList.remove('hidden');
    document.getElementById('deduction-end-screen').classList.add('hidden');
}

async function handleDeductionTurn() {
    if (!gameActive || deductionTurnsLeft === 0 || !deductionSelectedCityData) return;
    const cityData = deductionSelectedCityData;
    const resultDiv = document.getElementById('deduction-turn-result');

    // ** Check op uniek land **
    if (deductionTurnHistory.some(t => t.country === cityData.country)) {
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Je hebt al een stad in ${cityData.country} gekozen! Kies een ander land.</span>`;
        resultDiv.classList.remove('hidden');
        
        deductionSelectedCityData = null;
        document.getElementById('deduction-city-input').value = '';
        document.getElementById('deduction-submit-button').disabled = true;
        
        if (mapMarkers['deduction'] && mapInstances['deduction']) {
            mapInstances['deduction'].removeLayer(mapMarkers['deduction']);
            mapMarkers['deduction'] = null;
        }
        return;
    }

    const temp = await fetchTemperature(cityData, resultDiv);
    if (temp === null) return;

    const oldTarget = deductionTargetTemp;
    deductionTargetTemp -= temp;
    deductionTurnsLeft--;
    deductionTurnHistory.push({ name: cityData.name, country: cityData.country, temp: temp });

    const emoji = temp > 25 ? '☀️' : temp < 5 ? '❄️' : '☁️';
    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${emoji}</span>
            <div>
                <p class="text-gray-700"><strong>${cityData.name}, ${cityData.country}</strong> heeft een max van <strong>${temp}°C</strong></p>
                <p class="text-gray-700">Nieuw Doel: ${oldTarget}°C - ${temp}°C = <span class="font-bold text-blue-700">${deductionTargetTemp}°C</span></p>
            </div>
        </div>
    `;
    resultDiv.classList.remove('hidden');

    deductionSelectedCityData = null;
    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;
    
    if (mapMarkers['deduction'] && mapInstances['deduction']) {
        mapInstances['deduction'].removeLayer(mapMarkers['deduction']);
        mapMarkers['deduction'] = null;
    }

    updateDeductionDisplay();
    renderDeductionHistory();

    if (deductionTargetTemp <= 0 || deductionTurnsLeft === 0) endDeductionGame();
}

function updateDeductionDisplay() {
    document.getElementById('deduction-target-display').textContent = `${deductionTargetTemp}°C`;
    document.getElementById('deduction-turns-display').textContent = `${deductionTurnsLeft}`;
    document.getElementById('deduction-target-display').className = deductionTargetTemp < 0 ? "text-5xl font-black mt-1 tracking-tight text-red-500" : "text-5xl font-black mt-1 tracking-tight";
}

function renderDeductionHistory() {
    const list = document.getElementById('deduction-history-log');
    list.innerHTML = '';
    deductionTurnHistory.slice().reverse().forEach((turn, i) => {
        const li = document.createElement('li');
        li.className = 'text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 border-red-400 rounded';
        li.innerHTML = `<span>${turn.name}, ${turn.country}</span> <span class="font-bold">${turn.temp}°C</span>`;
        list.appendChild(li);
    });
    document.getElementById('deduction-history-placeholder').style.display = deductionTurnHistory.length ? 'none' : 'block';
}

function endDeductionGame() {
    gameActive = false;
    document.getElementById('deduction-game-board').classList.add('hidden');
    document.getElementById('deduction-end-screen').classList.remove('hidden');
    document.getElementById('deduction-turn-result').classList.add('hidden');
    
    const title = document.getElementById('deduction-end-title');
    const msg = document.getElementById('deduction-end-message');
    const score = deductionTargetTemp;

    if (score === 0) { title.textContent = "🏆 PERFECT!"; title.className = "text-green-600 font-black text-4xl mb-4"; msg.textContent = "Precies 0 bereikt!"; }
    else if (score > 0) { title.textContent = "Game Over"; title.className = "text-yellow-600 font-black text-4xl mb-4"; msg.textContent = `Score: ${score} punten.`; }
    else { title.textContent = "Onder Nul!"; title.className = "text-red-600 font-black text-4xl mb-4"; msg.textContent = `Je eindigde op ${score}°C.`; }
}

// **********************************************
// ********** 5. SPEL 2: RADEN LOGICA ***********
// **********************************************

function initializeGuessingGame() {
    guessingSecretNumber = Math.floor(Math.random() * (GUESSING_MAX_TARGET - GUESSING_MIN_TARGET + 1)) + GUESSING_MIN_TARGET;
    guessingTurnsLeft = GUESSING_MAX_TURNS;
    gameActive = true;
    guessingTurnHistory = [];
    guessingSelectedCityData = null;

    const input = document.getElementById('guessing-city-input');
    const btn = document.getElementById('guessing-submit-button');
    const mapContainer = document.getElementById('guessing-map-container');
    const modeDisplay = document.getElementById('guessing-mode-display');

    input.value = '';
    btn.disabled = true;
    btn.textContent = "Controleer";

    if (currentInputMode === 'map') {
        modeDisplay.textContent = "Modus: Landkaart";
        mapContainer.classList.remove('hidden');
        input.readOnly = true;
        input.placeholder = "Klik op de kaart om te gokken...";
        setTimeout(() => initMap('guessing'), 100);
    } else {
        modeDisplay.textContent = "Modus: Typen";
        mapContainer.classList.add('hidden');
        input.readOnly = false;
        input.placeholder = "Typ een stad...";
    }

    updateGuessingDisplay();
    renderGuessingHistory();

    document.getElementById('guessing-game-board').classList.remove('hidden');
    document.getElementById('guessing-end-screen').classList.add('hidden');
}

async function handleGuessingTurn() {
    if (!gameActive || guessingTurnsLeft === 0 || !guessingSelectedCityData) return;
    const cityData = guessingSelectedCityData;
    const resultDiv = document.getElementById('guessing-turn-result');

    // ** Check op uniek land **
    if (guessingTurnHistory.some(t => t.country === cityData.country)) {
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Je hebt al een stad in ${cityData.country} gekozen! Kies een ander land.</span>`;
        resultDiv.classList.remove('hidden');
        
        guessingSelectedCityData = null;
        document.getElementById('guessing-city-input').value = '';
        document.getElementById('guessing-submit-button').disabled = true;

        if (mapMarkers['guessing'] && mapInstances['guessing']) {
            mapInstances['guessing'].removeLayer(mapMarkers['guessing']);
            mapMarkers['guessing'] = null;
        }
        return;
    }

    const temp = await fetchTemperature(cityData, resultDiv);
    if (temp === null) return;

    let feedback = '', color = '', textCol = '';
    if (temp === guessingSecretNumber) { feedback = 'GEWONNEN!'; color = 'border-green-500'; textCol = 'text-green-600'; gameActive = false; }
    else if (temp < guessingSecretNumber) { feedback = 'HOGER'; color = 'border-yellow-500'; textCol = 'text-yellow-600'; }
    else { feedback = 'LAGER'; color = 'border-blue-500'; textCol = 'text-blue-600'; }

    guessingTurnsLeft--;
    guessingTurnHistory.push({ name: cityData.name, country: cityData.country, temp: temp, feedback: feedback, color: color, textCol: textCol });

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : temp < 5 ? '❄️' : '☁️'}</span>
            <div>
                <p class="text-gray-700"><strong>${cityData.name}, ${cityData.country}</strong> is <span class="${textCol} font-bold">${temp}°C</span></p>
                <p class="text-gray-700">Het getal is <strong class="${textCol}">${feedback}</strong></p>
            </div>
        </div>
    `;
    resultDiv.classList.remove('hidden');

    guessingSelectedCityData = null;
    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;

    if (mapMarkers['guessing'] && mapInstances['guessing']) {
        mapInstances['guessing'].removeLayer(mapMarkers['guessing']);
        mapMarkers['guessing'] = null;
    }

    updateGuessingDisplay();
    renderGuessingHistory();

    if (!gameActive || guessingTurnsLeft === 0) endGuessingGame(temp === guessingSecretNumber);
}

function updateGuessingDisplay() {
    document.getElementById('guessing-turns-display').textContent = `${guessingTurnsLeft}`;
    document.getElementById('guessing-target-display').textContent = gameActive ? "??" : `${guessingSecretNumber}°C`;
}

function renderGuessingHistory() {
    const list = document.getElementById('guessing-history-log');
    list.innerHTML = '';
    guessingTurnHistory.slice().reverse().forEach((turn, i) => {
        const li = document.createElement('li');
        li.className = `text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 rounded ${turn.color}`;
        li.innerHTML = `<span>${turn.name}, ${turn.country}</span> <span class="font-bold ${turn.textCol}">${turn.temp}°C (${turn.feedback})</span>`;
        list.appendChild(li);
    });
    document.getElementById('guessing-history-placeholder').style.display = guessingTurnHistory.length ? 'none' : 'block';
}

function endGuessingGame(won) {
    gameActive = false;
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');

    const title = document.getElementById('guessing-end-title');
    const msg = document.getElementById('guessing-end-message');
    const summaryList = document.getElementById('guessing-summary-list');

    // 1. Titel en Bericht
    if (won) { 
        title.textContent = "🥳 GEVONDEN!"; 
        title.className = "text-4xl font-black mb-2 text-green-600"; 
        msg.textContent = `Het geheime getal was inderdaad ${guessingSecretNumber}°C!`; 
    } else { 
        title.textContent = "HELAAS!"; 
        title.className = "text-4xl font-black mb-2 text-red-600"; 
        msg.textContent = `Je beurten zijn op. Het getal was ${guessingSecretNumber}°C.`; 
    }

    // 2. Samenvatting genereren
    summaryList.innerHTML = ''; 

    guessingTurnHistory.forEach((turn, index) => {
        const li = document.createElement('li');
        let icon = '➖';
        if (turn.feedback === 'HOGER') icon = '⬆️';
        if (turn.feedback === 'LAGER') icon = '⬇️';
        if (turn.feedback === 'GEWONNEN!') icon = '✅';

        li.className = "flex justify-between items-center p-2 rounded bg-white border border-gray-100 shadow-sm";
        li.innerHTML = `
            <div class="flex items-center">
                <span class="font-bold text-gray-400 mr-3 w-6">${index + 1}.</span>
                <div>
                    <span class="block font-semibold text-gray-800">${turn.name}, ${turn.country}</span>
                    <span class="text-xs text-gray-500">Jouw gok: ${turn.temp}°C</span>
                </div>
            </div>
            <div class="text-right">
                <span class="font-bold ${turn.textCol} text-sm block">${turn.feedback}</span>
                <span class="text-lg">${icon}</span>
            </div>
        `;
        summaryList.appendChild(li);
    });

    if (!won) {
        const targetLi = document.createElement('li');
        targetLi.className = "flex justify-between items-center p-2 rounded bg-green-50 border border-green-200 mt-2";
        targetLi.innerHTML = `
            <span class="font-bold text-green-800 ml-9">🎯 Het Doel</span>
            <span class="font-black text-green-700 text-lg">${guessingSecretNumber}°C</span>
        `;
        summaryList.appendChild(targetLi);
    }
}

// **********************************************
// ********** 6. NAVIGATIE & INIT ***************
// **********************************************

function showView(view) {
    mainMenu.classList.add('hidden');
    gameContainer.classList.add('hidden');
    document.getElementById('deduction-game').classList.add('hidden');
    document.getElementById('guessing-game').classList.add('hidden');

    if (view === 'menu') {
        mainMenu.classList.remove('hidden');
        checkApiStatus();
    } else {
        gameContainer.classList.remove('hidden');
    }
}

async function checkApiStatus() {
    const active = statusMessage.className.includes('green');
    if (!active) await testApiConnection();
}

async function checkApiAndStart(gameType, inputMode) {
    currentGameType = gameType;
    currentInputMode = inputMode;
    
    if (await testApiConnection()) {
        showView('game');
        if (gameType === 'deduction') {
            document.getElementById('deduction-game').classList.remove('hidden');
            initializeDeductionGame();
        } else {
            document.getElementById('guessing-game').classList.remove('hidden');
            initializeGuessingGame();
        }
    }
}

// Events
document.getElementById('deduction-submit-button').addEventListener('click', handleDeductionTurn);
document.getElementById('deduction-city-input').addEventListener('input', (e) => handleCityInput(e, 'deduction'));
document.getElementById('deduction-city-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleDeductionTurn(); });

document.getElementById('guessing-submit-button').addEventListener('click', handleGuessingTurn);
document.getElementById('guessing-city-input').addEventListener('input', (e) => handleCityInput(e, 'guessing'));
document.getElementById('guessing-city-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGuessingTurn(); });

window.onload = checkApiStatus;