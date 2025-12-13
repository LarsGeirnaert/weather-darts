// **********************************************
// ********** 0. FIREBASE SETUP *****************
// **********************************************

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// JOUW CONFIGURATIE
const firebaseConfig = {
  apiKey: "AIzaSyDm-OaKbBgCC4WazbyGq5WJ-USqQkFTzsY",
  authDomain: "weather-duel-cf13e.firebaseapp.com",
  projectId: "weather-duel-cf13e",
  storageBucket: "weather-duel-cf13e.firebasestorage.app",
  messagingSenderId: "1066877072806",
  appId: "1:1066877072806:web:068b650d5a5b62872c4b67",
  databaseURL: "https://weather-duel-cf13e-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


// **********************************************
// ********** 1. CONFIGURATIE & STATUS **********
// **********************************************

const API_KEY = "b10dc274a5e56f6f6fc4fe68a7987217";
const GEO_API_URL = "https://api.openweathermap.org/geo/1.0/direct";
const FORECAST_API_URL = "https://api.openweathermap.org/data/2.5/forecast";
const REVERSE_GEO_API_URL = "https://api.openweathermap.org/geo/1.0/reverse";

// Game Constants
const DEDUCTION_MAX_TURNS = 5;
const DEDUCTION_MIN_TARGET = 25;
const DEDUCTION_MAX_TARGET = 125;
const GUESSING_MAX_TURNS = 7;
const GUESSING_MIN_TARGET = 5;
const GUESSING_MAX_TARGET = 30;
const DEBOUNCE_DELAY = 300;

// Globale Status
let currentGameType = '';
let currentInputMode = '';
let gameActive = false;
let debounceTimer;

// State Variabelen
let deductionTargetTemp = 0;
let deductionTurnsLeft = DEDUCTION_MAX_TURNS;
let deductionTurnHistory = [];
let deductionSelectedCityData = null;

let guessingSecretNumber = 0;
let guessingTurnsLeft = GUESSING_MAX_TURNS;
let guessingTurnHistory = [];
let guessingSelectedCityData = null;

let currentRoomId = null;
let playerRole = null; 
let duelCityData = null;

// Leaflet Maps
let mapInstances = {};
let mapMarkers = {};

// DOM Elementen
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const statusMessage = document.getElementById('status-message');


// **********************************************
// ********** 2. EXPORTS VOOR HTML **************
// **********************************************
window.showView = showView;
window.checkApiAndStart = checkApiAndStart;
window.handleDeductionTurn = handleDeductionTurn;


// **********************************************
// ********** 3. API & HELPER FUNCTIES **********
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
                if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
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
        const displayName = `${city.name}, ${getCountryName(city.country)}`;
        div.textContent = displayName;
        div.className = 'suggestion-item';
        div.onclick = () => {
            container.previousElementSibling.value = displayName;
            container.classList.add('hidden');
            setCityData({ name: city.name, country: getCountryName(city.country), lat: city.lat, lon: city.lon });
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
    } else if (gameType === 'guessing') {
        input = document.getElementById('guessing-city-input');
        container = document.getElementById('guessing-suggestions');
        btn = document.getElementById('guessing-submit-button');
        callback = (c) => renderSuggestions(c, container, btn, (city) => guessingSelectedCityData = city);
        setter = (c) => guessingSelectedCityData = c;
    } else if (gameType === 'duel') {
        input = document.getElementById('duel-city-input');
        container = document.getElementById('duel-suggestions');
        btn = document.getElementById('duel-submit-btn');
        callback = (c) => renderSuggestions(c, container, btn, (city) => duelCityData = city);
        setter = (c) => duelCityData = c;
    }

    const query = event.target.value.trim();
    setter(null);
    btn.disabled = true;
    if (query.length < 3) { container.classList.add('hidden'); btn.disabled = false; return; }
    debounceTimer = setTimeout(() => fetchCitySuggestions(query, callback), DEBOUNCE_DELAY);
}


// **********************************************
// ********** 4. MAP LOGIC **********************
// **********************************************

function initMap(gameType) {
    const mapId = gameType === 'deduction' ? 'deduction-map' : 'guessing-map';
    if (mapInstances[gameType]) { mapInstances[gameType].invalidateSize(); return; }
    const map = L.map(mapId).setView([52.0, 5.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
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
    document.getElementById(inputId).value = "Zoeken...";
    document.getElementById(btnId).disabled = true;

    try {
        const res = await fetch(`${REVERSE_GEO_API_URL}?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`);
        const data = await res.json();
        if (data.length > 0) {
            const p = data[0];
            const cityData = { name: p.name, country: getCountryName(p.country), lat: p.lat, lon: p.lon };
            document.getElementById(inputId).value = `${p.name}, ${cityData.country}`;
            if (gameType === 'deduction') deductionSelectedCityData = cityData;
            else guessingSelectedCityData = cityData;
            document.getElementById(btnId).disabled = false;
        } else {
            document.getElementById(inputId).value = "Geen stad.";
        }
    } catch (e) { console.error(e); }
}


// **********************************************
// ********** 5. SPEL 1 & 2 (ORIGINEEL) *********
// **********************************************

function initializeDeductionGame() {
    deductionTargetTemp = Math.floor(Math.random() * (DEDUCTION_MAX_TARGET - DEDUCTION_MIN_TARGET + 1)) + DEDUCTION_MIN_TARGET;
    deductionTurnsLeft = DEDUCTION_MAX_TURNS;
    gameActive = true;
    deductionTurnHistory = [];
    deductionSelectedCityData = null;

    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;
    document.getElementById('deduction-submit-button').textContent = "Trek Temperatuur Af";
    
    if (currentInputMode === 'map') {
        document.getElementById('deduction-mode-display').textContent = "Modus: Landkaart";
        document.getElementById('deduction-map-container').classList.remove('hidden');
        document.getElementById('deduction-city-input').readOnly = true;
        setTimeout(() => initMap('deduction'), 100);
    } else {
        document.getElementById('deduction-mode-display').textContent = "Modus: Typen";
        document.getElementById('deduction-map-container').classList.add('hidden');
        document.getElementById('deduction-city-input').readOnly = false;
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
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Al een stad in ${cityData.country}!</span>`;
        resultDiv.classList.remove('hidden');
        deductionSelectedCityData = null;
        return;
    }

    const temp = await fetchTemperature(cityData, resultDiv);
    if (temp === null) return;

    const oldTarget = deductionTargetTemp;
    deductionTargetTemp -= temp;
    deductionTurnsLeft--;
    deductionTurnHistory.push({ name: cityData.name, country: cityData.country, temp: temp });

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : temp < 5 ? '❄️' : '☁️'}</span>
            <div>
                <p><strong>${cityData.name}</strong>: <strong>${temp}°C</strong></p>
                <p>Nieuw Doel: ${oldTarget} - ${temp} = <strong>${deductionTargetTemp}°C</strong></p>
            </div>
        </div>`;
    resultDiv.classList.remove('hidden');
    deductionSelectedCityData = null;
    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;
    updateDeductionDisplay();
    renderDeductionHistory();
    if (deductionTargetTemp <= 0 || deductionTurnsLeft === 0) endDeductionGame();
}

function updateDeductionDisplay() {
    document.getElementById('deduction-target-display').textContent = `${deductionTargetTemp}°C`;
    document.getElementById('deduction-turns-display').textContent = `${deductionTurnsLeft}`;
}

function renderDeductionHistory() {
    const list = document.getElementById('deduction-history-log');
    list.innerHTML = '';
    deductionTurnHistory.slice().reverse().forEach((turn) => {
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
    const msg = document.getElementById('deduction-end-message');
    const title = document.getElementById('deduction-end-title');
    if (deductionTargetTemp === 0) { title.textContent = "🏆 PERFECT!"; msg.textContent = "Precies 0!"; }
    else if (deductionTargetTemp > 0) { title.textContent = "Game Over"; msg.textContent = `Score: ${deductionTargetTemp}`; }
    else { title.textContent = "Onder Nul!"; msg.textContent = `Eind: ${deductionTargetTemp}`; }
}


function initializeGuessingGame() {
    guessingSecretNumber = Math.floor(Math.random() * (GUESSING_MAX_TARGET - GUESSING_MIN_TARGET + 1)) + GUESSING_MIN_TARGET;
    guessingTurnsLeft = GUESSING_MAX_TURNS;
    gameActive = true;
    guessingTurnHistory = [];
    guessingSelectedCityData = null;

    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;

    if (currentInputMode === 'map') {
        document.getElementById('guessing-mode-display').textContent = "Modus: Landkaart";
        document.getElementById('guessing-map-container').classList.remove('hidden');
        document.getElementById('guessing-city-input').readOnly = true;
        setTimeout(() => initMap('guessing'), 100);
    } else {
        document.getElementById('guessing-mode-display').textContent = "Modus: Typen";
        document.getElementById('guessing-map-container').classList.add('hidden');
        document.getElementById('guessing-city-input').readOnly = false;
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
        resultDiv.innerHTML = `<span class="text-red-600 font-bold">❌ Al een stad in ${cityData.country}!</span>`;
        resultDiv.classList.remove('hidden');
        guessingSelectedCityData = null;
        return;
    }

    const temp = await fetchTemperature(cityData, resultDiv);
    if (temp === null) return;

    let feedback = 'LAGER';
    if (temp === guessingSecretNumber) { feedback = 'GEWONNEN!'; gameActive = false; }
    else if (temp < guessingSecretNumber) feedback = 'HOGER';

    guessingTurnsLeft--;
    guessingTurnHistory.push({ name: cityData.name, country: cityData.country, temp, feedback });

    resultDiv.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${temp > 25 ? '☀️' : '❄️'}</span>
            <div><p><strong>${cityData.name}</strong> is <strong>${temp}°C</strong>. Getal is <strong>${feedback}</strong></p></div>
        </div>`;
    resultDiv.classList.remove('hidden');
    guessingSelectedCityData = null;
    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;
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
    guessingTurnHistory.slice().reverse().forEach((turn) => {
        const li = document.createElement('li');
        li.className = 'text-gray-700 text-sm flex justify-between p-2 bg-gray-50 border-l-4 rounded';
        li.innerHTML = `<span>${turn.name}</span> <span class="font-bold">${turn.temp}°C (${turn.feedback})</span>`;
        list.appendChild(li);
    });
    document.getElementById('guessing-history-placeholder').style.display = guessingTurnHistory.length ? 'none' : 'block';
}

function endGuessingGame(won) {
    gameActive = false;
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');
    document.getElementById('guessing-end-title').textContent = won ? "GEVONDEN!" : "HELAAS!";
    document.getElementById('guessing-end-message').textContent = `Het getal was ${guessingSecretNumber}°C.`;
}


// **********************************************
// ********** 6. DUEL LOGICA (DE FIX) ***********
// **********************************************

function initDuelLobby() {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const input = document.getElementById('room-code-input');

    const newCreate = createBtn.cloneNode(true);
    const newJoin = joinBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newCreate, createBtn);
    joinBtn.parentNode.replaceChild(newJoin, joinBtn);

    newCreate.onclick = () => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        createRoom(roomId);
    };

    newJoin.onclick = () => {
        const roomId = input.value.toUpperCase().trim();
        if(roomId.length === 4) joinRoom(roomId);
    };
}

function createRoom(roomId) {
    currentRoomId = roomId;
    playerRole = 'host';
    const initialTarget = Math.floor(Math.random() * 35) - 5; 

    // Initialiseer kamer met scores op 100 en 'roundState' op 'guessing'
    set(ref(db, 'rooms/' + roomId), {
        targetTemp: initialTarget,
        scores: { host: 100, guest: 100 },
        round: 1,
        roundState: 'guessing', // 'guessing' OF 'results'
        host: { status: 'waiting' },
        guest: { status: 'empty' }
    });

    waitForGameStart();
}

function joinRoom(roomId) {
    currentRoomId = roomId;
    playerRole = 'guest';
    
    update(ref(db, 'rooms/' + roomId + '/guest'), {
        status: 'joined'
    });

    waitForGameStart();
}

function waitForGameStart() {
    document.getElementById('duel-lobby').classList.add('hidden');
    document.getElementById('duel-board').classList.remove('hidden');
    document.getElementById('room-code-display').textContent = currentRoomId;

    // ALLES-IN-EEN Listener
    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return; 

        // 1. Update Altijd de Info
        document.getElementById('duel-target-display').textContent = `${data.targetTemp}°C`;
        document.getElementById('round-display').textContent = data.round;
        
        if (data.scores) {
            const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
            const oppScore = playerRole === 'host' ? data.scores.guest : data.scores.host;
            document.getElementById('my-score').textContent = Math.round(myScore);
            document.getElementById('opp-score').textContent = Math.round(oppScore);
        }

        // 2. CHECK STATUS: Zijn we aan het raden of resultaten aan het kijken?
        if (data.roundState === 'results') {
             // Toon resultaten (zodat beide spelers het zien)
             if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                 showDuelResults(data);
             }
        } else {
             // We zijn aan het raden
             document.getElementById('duel-result').classList.add('hidden');
             document.getElementById('duel-waiting-msg').classList.add('hidden');
             document.getElementById('duel-submit-btn').classList.remove('hidden');
             document.getElementById('duel-city-input').disabled = false;
             
             // Check of wij zelf al gegokt hebben
             const myData = playerRole === 'host' ? data.host : data.guest;
             if (myData && myData.temp) {
                 document.getElementById('duel-submit-btn').classList.add('hidden');
                 document.getElementById('duel-waiting-msg').classList.remove('hidden');
             }
        }

        // 3. HOST LOGICA: Als beide gegokt hebben EN we staan nog op 'guessing' -> Berekenen
        if (playerRole === 'host' && data.roundState === 'guessing') {
            if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                calculateAndSaveScores(data);
            }
        }
    });

    // Knoppen opnieuw koppelen
    const btn = document.getElementById('duel-submit-btn');
    const nextBtn = document.getElementById('next-round-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    const newNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);
    
    newBtn.onclick = submitDuelGuess;
    newNext.onclick = startNextRound;
}

// BEREKENING (Alleen Host doet dit)
function calculateAndSaveScores(data) {
    const target = data.targetTemp;
    const hostDiff = Math.abs(target - data.host.temp);
    const guestDiff = Math.abs(target - data.guest.temp);
    const round = data.round;

    let newScores = { ...data.scores };
    
    // Formule: (|VerliezerFout| - |WinnaarFout|) * Ronde
    if (hostDiff < guestDiff) {
        // Host wint
        const damage = (guestDiff - hostDiff) * round;
        newScores.guest -= damage;
    } else if (guestDiff < hostDiff) {
        // Gast wint
        const damage = (hostDiff - guestDiff) * round;
        newScores.host -= damage;
    }

    // UPDATE DB EN ZET STATE OP RESULTS
    update(ref(db, 'rooms/' + currentRoomId), {
        scores: newScores,
        roundState: 'results'
    });
}

async function submitDuelGuess() {
    if (!duelCityData) return;
    
    document.getElementById('duel-submit-btn').classList.add('hidden');
    document.getElementById('duel-waiting-msg').classList.remove('hidden');
    document.getElementById('duel-city-input').disabled = true;

    const temp = await fetchTemperature(duelCityData, null);

    if (temp !== null) {
        // Stuur gok naar DB
        update(ref(db, `rooms/${currentRoomId}/${playerRole}`), {
            guess: duelCityData.name,
            temp: temp
        });
    }
}

function showDuelResults(data) {
    const myData = playerRole === 'host' ? data.host : data.guest;
    const oppData = playerRole === 'host' ? data.guest : data.host;
    const target = data.targetTemp;
    const round = data.round;

    const myDiff = Math.abs(target - myData.temp);
    const oppDiff = Math.abs(target - oppData.temp);

    document.getElementById('result-round-num').textContent = round;
    document.getElementById('p1-result-city').textContent = myData.guess;
    document.getElementById('p1-result-temp').textContent = `${myData.temp}°C`;
    document.getElementById('p1-diff').textContent = `Afwijking: ${myDiff}`;

    document.getElementById('p2-result-city').textContent = oppData.guess;
    document.getElementById('p2-result-temp').textContent = `${oppData.temp}°C`;
    document.getElementById('p2-diff').textContent = `Afwijking: ${oppDiff}`;

    const banner = document.getElementById('winner-banner');
    const explanation = document.getElementById('damage-explanation');
    
    const baseDamage = Math.abs(myDiff - oppDiff);
    const totalDamage = baseDamage * round;

    if (myDiff < oppDiff) {
        banner.textContent = "🏆 JIJ WINT!";
        banner.className = "text-xl font-black text-green-600 mb-4";
        explanation.textContent = `Verschil: ${baseDamage} °C.\n${baseDamage} x Ronde ${round} = -${totalDamage} pnt voor tegenstander!`;
    } else if (oppDiff < myDiff) {
        banner.textContent = "😢 VERLOREN...";
        banner.className = "text-xl font-black text-red-600 mb-4";
        explanation.textContent = `Verschil: ${baseDamage} °C.\n${baseDamage} x Ronde ${round} = -${totalDamage} pnt voor jou!`;
    } else {
        banner.textContent = "🤝 GELIJKSPEL!";
        banner.className = "text-xl font-black text-blue-600 mb-4";
        explanation.textContent = "Gelijke afwijking. Niemand verliest punten.";
    }

    document.getElementById('duel-result').classList.remove('hidden');
}

function startNextRound() {
    if (playerRole === 'host') {
        onValue(ref(db, `rooms/${currentRoomId}/round`), (snapshot) => {
            const currentRound = snapshot.val();
            const newTarget = Math.floor(Math.random() * 35) - 5;
            
            // RESET NAAR GUESSING
            update(ref(db, `rooms/${currentRoomId}`), {
                targetTemp: newTarget,
                round: currentRound + 1,
                roundState: 'guessing',
                host: { status: 'playing', guess: null, temp: null },
                guest: { status: 'playing', guess: null, temp: null }
            });
        }, { onlyOnce: true });
        
        document.getElementById('duel-city-input').value = '';
        duelCityData = null;
    } else {
        document.getElementById('winner-banner').textContent = "Wachten op host...";
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
    document.getElementById('duel-game').classList.add('hidden');

    if (view === 'menu') {
        mainMenu.classList.remove('hidden');
        checkApiStatus();
    } else {
        gameContainer.classList.remove('hidden');
    }
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
            initDuelLobby();
        }
    }
}

async function checkApiStatus() {
    const active = statusMessage.className.includes('green');
    if (!active) await testApiConnection();
}

document.getElementById('deduction-submit-button').addEventListener('click', handleDeductionTurn);
document.getElementById('deduction-city-input').addEventListener('input', (e) => handleCityInput(e, 'deduction'));
document.getElementById('deduction-city-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleDeductionTurn(); });

document.getElementById('guessing-submit-button').addEventListener('click', handleGuessingTurn);
document.getElementById('guessing-city-input').addEventListener('input', (e) => handleCityInput(e, 'guessing'));
document.getElementById('guessing-city-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGuessingTurn(); });

document.getElementById('duel-city-input').addEventListener('input', (e) => handleCityInput(e, 'duel'));

checkApiStatus();