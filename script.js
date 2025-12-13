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

// State Spel 3 (Duel)
let duelStreak = 0;
let duelCity1 = null; // De "kampioen"
let duelCity2 = null; // De "uitdager"
let duelTemp1 = 0;
let duelTemp2 = 0;
let duelCondition = ''; // 'higher' of 'lower'

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

const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });

function getCountryName(code) {
    try { return regionNames.of(code); } catch (e) { return code; }
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

async function fetchTemperature(cityData, resultElement) {
    const forecastParams = new URLSearchParams({ lat: cityData.lat, lon: cityData.lon, appid: API_KEY, units: 'metric' }).toString();
    try {
        const response = await fetch(`${FORECAST_API_URL}?${forecastParams}`);
        const data = await response.json();
        if (response.status !== 200) throw new Error("API Fout");

        const todayDate = data.list[0].dt_txt.slice(0, 10);
        let maxTemp = -Infinity; 
        let found = false;

        for (const item of data.list) {
            if (item.dt_txt.startsWith(todayDate)) {
                if (item.main.temp > maxTemp) maxTemp = item.main.temp;
                found = true;
            }
        }

        if (!found) return null;
        return Math.round(maxTemp);

    } catch (error) {
        if(resultElement) resultElement.innerHTML = `<span class="text-red-500">❌ Fout bij ophalen weergegevens.</span>`;
        return null;
    }
}

// --- Autocomplete ---
async function fetchCitySuggestions(query, callback) {
    const params = new URLSearchParams({ q: query, limit: 5, appid: API_KEY }).toString();
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

    if (query.length < 3) { container.classList.add('hidden'); btn.disabled = true; return; }
    debounceTimer = setTimeout(() => fetchCitySuggestions(query, callback), DEBOUNCE_DELAY);
}

// **********************************************
// ********** 3. KAART LOGICA (LEAFLET) *********
// **********************************************

function initMap(gameType) {
    const mapId = gameType === 'deduction' ? 'deduction-map' : 'guessing-map';
    if (mapInstances[gameType]) { mapInstances[gameType].invalidateSize(); return; }

    const map = L.map(mapId).setView([52.0, 5.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

    map.on('click', (e) => onMapClick(e, gameType));
    mapInstances[gameType] = map;
}

async function onMapClick(e, gameType) {
    if (!gameActive) return;
    const lat = e.latlng.lat; const lon = e.latlng.lng; const map = mapInstances[gameType];

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
            if (gameType === 'deduction') deductionSelectedCityData = cityData;
            else guessingSelectedCityData = cityData;
            document.getElementById(btnId).disabled = false;
        } else {
            document.getElementById(inputId).value = "Geen stad gevonden (oceaan?).";
        }
    } catch (err) { console.error(err); }
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
        let icon = '➖';
        if (turn.feedback === 'HOGER') icon = '⬆️';
        if (turn.feedback === 'LAGER') icon = '⬇️';
        if (turn.feedback === 'GEWONNEN!') icon = '✅';

        li.className = `text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 rounded ${turn.color}`;
        li.innerHTML = `<span>${turn.name}, ${turn.country}</span> <span class="font-bold ${turn.textCol}">${turn.temp}°C ${icon}</span>`;
        list.appendChild(li);
    });
}

function endGuessingGame(won) {
    gameActive = false;
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');

    const title = document.getElementById('guessing-end-title');
    const msg = document.getElementById('guessing-end-message');
    const summaryList = document.getElementById('guessing-summary-list');

    if (won) { 
        title.textContent = "🥳 GEVONDEN!"; 
        title.className = "text-4xl font-black mb-2 text-green-600"; 
        msg.textContent = `Het geheime getal was inderdaad ${guessingSecretNumber}°C!`; 
    } else { 
        title.textContent = "HELAAS!"; 
        title.className = "text-4xl font-black mb-2 text-red-600"; 
        msg.textContent = `Je beurten zijn op. Het getal was ${guessingSecretNumber}°C.`; 
    }

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
// ********** 6. SPEL 3: DUEL LOGICA ************
// **********************************************

// Lijst van steden voor het duel (hardcoded om API limits te sparen)
const DUEL_CITIES = [
    { name: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
    { name: "Delhi", country: "IN", lat: 28.6139, lon: 77.2090 },
    { name: "Shanghai", country: "CN", lat: 31.2304, lon: 121.4737 },
    { name: "São Paulo", country: "BR", lat: -23.5505, lon: -46.6333 },
    { name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332 },
    { name: "Caïro", country: "EG", lat: 30.0444, lon: 31.2357 },
    { name: "Mumbai", country: "IN", lat: 19.0760, lon: 72.8777 },
    { name: "Beijing", country: "CN", lat: 39.9042, lon: 116.4074 },
    { name: "Osaka", country: "JP", lat: 34.6937, lon: 135.5023 },
    { name: "New York", country: "US", lat: 40.7128, lon: -74.0060 },
    { name: "Karachi", country: "PK", lat: 24.8607, lon: 67.0011 },
    { name: "Buenos Aires", country: "AR", lat: -34.6037, lon: -58.3816 },
    { name: "Istanbul", country: "TR", lat: 41.0082, lon: 28.9784 },
    { name: "Rio de Janeiro", country: "BR", lat: -22.9068, lon: -43.1729 },
    { name: "Manila", country: "PH", lat: 14.5995, lon: 120.9842 },
    { name: "Lagos", country: "NG", lat: 6.5244, lon: 3.3792 },
    { name: "Los Angeles", country: "US", lat: 34.0522, lon: -118.2437 },
    { name: "Moskou", country: "RU", lat: 55.7558, lon: 37.6173 },
    { name: "Parijs", country: "FR", lat: 48.8566, lon: 2.3522 },
    { name: "Londen", country: "GB", lat: 51.5074, lon: -0.1278 },
    { name: "Bangkok", country: "TH", lat: 13.7563, lon: 100.5018 },
    { name: "Jakarta", country: "ID", lat: -6.2088, lon: 106.8456 },
    { name: "Seoul", country: "KR", lat: 37.5665, lon: 126.9780 },
    { name: "Sydney", country: "AU", lat: -33.8688, lon: 151.2093 },
    { name: "Kaapstad", country: "ZA", lat: -33.9249, lon: 18.4241 },
    { name: "Rome", country: "IT", lat: 41.9028, lon: 12.4964 },
    { name: "Berlijn", country: "DE", lat: 52.5200, lon: 13.4050 },
    { name: "Madrid", country: "ES", lat: 40.4168, lon: -3.7038 },
    { name: "Toronto", country: "CA", lat: 43.6510, lon: -79.3470 },
    { name: "Dubai", country: "AE", lat: 25.2048, lon: 55.2708 },
    { name: "Singapore", country: "SG", lat: 1.3521, lon: 103.8198 },
    { name: "Hanoi", country: "VN", lat: 21.0285, lon: 105.8542 },
    { name: "Lima", country: "PE", lat: -12.0464, lon: -77.0428 },
    { name: "Bogotá", country: "CO", lat: 4.7110, lon: -74.0721 },
    { name: "Teheran", country: "IR", lat: 35.6892, lon: 51.3890 },
    { name: "Bagdad", country: "IQ", lat: 33.3152, lon: 44.3661 },
    { name: "Riyad", country: "SA", lat: 24.7136, lon: 46.6753 },
    { name: "Athene", country: "GR", lat: 37.9838, lon: 23.7275 },
    { name: "Warschau", country: "PL", lat: 52.2297, lon: 21.0122 },
    { name: "Wenen", country: "AT", lat: 48.2082, lon: 16.3738 },
    { name: "Amsterdam", country: "NL", lat: 52.3676, lon: 4.9041 },
    { name: "Brussel", country: "BE", lat: 50.8503, lon: 4.3517 },
    { name: "Stockholm", country: "SE", lat: 59.3293, lon: 18.0686 },
    { name: "Oslo", country: "NO", lat: 59.9139, lon: 10.7522 },
    { name: "Helsinki", country: "FI", lat: 60.1699, lon: 24.9384 },
    { name: "Kopenhagen", country: "DK", lat: 55.6761, lon: 12.5683 },
    { name: "Lissabon", country: "PT", lat: 38.7223, lon: -9.1393 },
    { name: "Dublin", country: "IE", lat: 53.3498, lon: -6.2603 },
    { name: "Reykjavik", country: "IS", lat: 64.1265, lon: -21.8174 }
];

async function initializeDuelGame() {
    gameActive = true;
    duelStreak = 0;
    
    // UI Setup
    document.getElementById('duel-loading').classList.remove('hidden');
    document.getElementById('duel-game-board').classList.add('hidden');
    document.getElementById('duel-message').classList.add('hidden');
    document.getElementById('duel-score').textContent = "0";

    // Kies twee willekeurige steden
    await startNewDuelRound(true);
}

async function startNewDuelRound(firstRound = false) {
    document.getElementById('duel-message').classList.add('hidden');
    
    // Reset kaarten visueel
    document.getElementById('duel-result-1').classList.add('hidden');
    document.getElementById('duel-result-2').classList.add('hidden');
    document.getElementById('duel-card-1').classList.remove('border-green-500', 'border-red-500', 'opacity-50');
    document.getElementById('duel-card-2').classList.remove('border-green-500', 'border-red-500', 'opacity-50');

    if (firstRound) {
        // Eerste ronde: kies twee nieuwe steden
        let idx1 = Math.floor(Math.random() * DUEL_CITIES.length);
        let idx2;
        do { idx2 = Math.floor(Math.random() * DUEL_CITIES.length); } while (idx1 === idx2);
        
        duelCity1 = DUEL_CITIES[idx1];
        duelCity2 = DUEL_CITIES[idx2];
        
        // Haal temp op voor stad 1 (want die hebben we nog niet)
        duelTemp1 = await fetchTemperature(duelCity1);
    } else {
        // Volgende rondes: Winnaar (City 1) blijft, kies nieuwe City 2
        let idx2;
        do { idx2 = Math.floor(Math.random() * DUEL_CITIES.length); } 
        while (DUEL_CITIES[idx2].name === duelCity1.name); // Zorg dat het niet dezelfde is
        
        duelCity2 = DUEL_CITIES[idx2];
    }

    // Haal temp op voor stad 2
    duelTemp2 = await fetchTemperature(duelCity2);

    // Bepaal de conditie (50% kans op Hoger of Lager)
    duelCondition = Math.random() < 0.5 ? 'higher' : 'lower';

    // Update UI
    updateDuelUI();
    document.getElementById('duel-loading').classList.add('hidden');
    document.getElementById('duel-game-board').classList.remove('hidden');
}

function updateDuelUI() {
    // Teksten invullen
    document.getElementById('duel-city-1').textContent = duelCity1.name;
    document.getElementById('duel-country-1').textContent = getCountryName(duelCity1.country);
    
    document.getElementById('duel-city-2').textContent = duelCity2.name;
    document.getElementById('duel-country-2').textContent = getCountryName(duelCity2.country);

    // Vraag instellen
    const questionBox = document.getElementById('duel-question-box');
    if (duelCondition === 'higher') {
        questionBox.textContent = "Waar is het WARMER? ☀️";
        questionBox.className = "mb-6 p-4 rounded-xl text-center font-black text-2xl text-white shadow-lg transition-colors duration-300 bg-orange-500";
    } else {
        questionBox.textContent = "Waar is het KOUDER? ❄️";
        questionBox.className = "mb-6 p-4 rounded-xl text-center font-black text-2xl text-white shadow-lg transition-colors duration-300 bg-blue-500";
    }
}

async function handleDuelGuess(choice) {
    if (!gameActive) return; // Voorkom dubbelklikken

    // Toon de resultaten
    document.getElementById('duel-result-1').textContent = `${duelTemp1}°C`;
    document.getElementById('duel-result-1').classList.remove('hidden');
    
    document.getElementById('duel-result-2').textContent = `${duelTemp2}°C`;
    document.getElementById('duel-result-2').classList.remove('hidden');

    // Bepaal de winnaar (welke kant had gelijk?)
    let winningSide = 0; 
    
    // Logica voor 'higher'
    if (duelCondition === 'higher') {
        if (duelTemp1 > duelTemp2) winningSide = 1;
        else if (duelTemp2 > duelTemp1) winningSide = 2;
        else winningSide = 0; // Gelijkspel = speler wint altijd
    } 
    // Logica voor 'lower'
    else {
        if (duelTemp1 < duelTemp2) winningSide = 1;
        else if (duelTemp2 < duelTemp1) winningSide = 2;
        else winningSide = 0; // Gelijkspel
    }

    // Check of speler gelijk had
    // Als winningSide 0 is, is het gelijkspel en rekenen we het goed
    if (winningSide === 0 || winningSide === choice) {
        // GOED GERADEN!
        duelStreak++;
        document.getElementById('duel-score').textContent = duelStreak;
        
        // Visuele feedback
        document.getElementById(`duel-card-${choice}`).classList.add('border-green-500');
        
        // De winnende stad wordt Stad 1 voor de volgende ronde
        // Als speler 2 koos, verplaatsen we data van 2 naar 1
        if (choice === 2) {
            duelCity1 = duelCity2;
            duelTemp1 = duelTemp2;
        }
        // (Als choice 1 was, hoeven we niks te verplaatsen, want 1 was al 1)

        // Wacht even en start nieuwe ronde
        gameActive = false; // Blokkeer klikken
        setTimeout(() => {
            gameActive = true;
            startNewDuelRound(false);
        }, 2000);

    } else {
        // FOUT GERADEN!
        document.getElementById(`duel-card-${choice}`).classList.add('border-red-500');
        document.getElementById(`duel-card-${winningSide}`).classList.add('border-green-500');
        
        const msgDiv = document.getElementById('duel-message');
        msgDiv.innerHTML = `
            <p class="font-bold text-red-600 text-lg mb-2">Helaas! Game Over.</p>
            <p class="text-gray-600 mb-4">Je streak was: <span class="font-bold text-orange-500">${duelStreak}</span></p>
            <button onclick="initializeDuelGame()" class="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-black transition">Opnieuw</button>
        `;
        msgDiv.classList.remove('hidden');
        gameActive = false;
    }
}

// **********************************************
// ********** 7. NAVIGATIE & INIT ***************
// **********************************************

function showView(view) {
    mainMenu.classList.add('hidden');
    gameContainer.classList.add('hidden');
    document.getElementById('deduction-game').classList.add('hidden');
    document.getElementById('guessing-game').classList.add('hidden');
    document.getElementById('duel-game').classList.add('hidden'); // Nieuw

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
        } else if (gameType === 'guessing') {
            document.getElementById('guessing-game').classList.remove('hidden');
            initializeGuessingGame();
        } else if (gameType === 'duel') {
            document.getElementById('duel-game').classList.remove('hidden');
            initializeDuelGame();
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