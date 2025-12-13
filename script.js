// **********************************************
// ********** 1. CONFIGURATIE & STATUS **********
// **********************************************

// Jouw API-sleutel.
const API_KEY = "b10dc274a5e56f6f6fc4fe68a7987217";
const GEO_API_URL = "https://api.openweathermap.org/geo/1.0/direct";
const FORECAST_API_URL = "https://api.openweathermap.org/data/2.5/forecast";

// --- Spel parameters ---
const DEDUCTION_MAX_TURNS = 5;
const DEDUCTION_MIN_TARGET = 25;
const DEDUCTION_MAX_TARGET = 125;

const GUESSING_MAX_TURNS = 7;
const GUESSING_MIN_TARGET = 5;
const GUESSING_MAX_TARGET = 30;
const DEBOUNCE_DELAY = 300;

// --- Game State (Status) ---
let deductionTargetTemp = 0;
let deductionTurnsLeft = DEDUCTION_MAX_TURNS;
let deductionTurnHistory = [];
let deductionSelectedCityData = null;

let guessingSecretNumber = 0;
let guessingTurnsLeft = GUESSING_MAX_TURNS;
let guessingTurnHistory = [];
let guessingSelectedCityData = null;

let gameActive = false;
let debounceTimer;

// --- DOM Elementen ---
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const statusMessage = document.getElementById('status-message');
const startGameButton = document.getElementById('startGameButton');
const startGameGuessButton = document.getElementById('startGameGuessButton');

// **********************************************
// ********** 2. HULPMIDDELEN & LANDKAARTEN *******
// **********************************************

const COUNTRY_MAP = {
    "BE": "België", "NL": "Nederland", "DE": "Duitsland", "FR": "Frankrijk",
    "US": "Verenigde Staten", "GB": "Verenigd Koninkrijk", "CA": "Canada", "AU": "Australië",
    "JP": "Japan", "CN": "China", "IN": "India", "BR": "Brazilië",
    "RU": "Rusland", "NO": "Noorwegen", "SE": "Zweden", "DK": "Denemarken",
    "ES": "Spanje", "IT": "Italië", "PT": "Portugal", "GR": "Griekenland",
    "AT": "Oostenrijk", "CH": "Zwitserland", "IE": "Ierland", "PL": "Polen",
    "HU": "Hongarije", "CZ": "Tsjechië", "SK": "Slowakije", "HR": "Kroatië",
    "TR": "Turkije", "SA": "Saoedi-Arabië", "AE": "Verenigde Arabische Emiraten",
    "SG": "Singapore", "MY": "Maleisië", "ID": "Indonesië", "TH": "Thailand",
    "PH": "Filipijnen", "KR": "Zuid-Korea", "MX": "Mexico", "AR": "Argentinië",
    "CL": "Chili", "ZA": "Zuid-Afrika", "EG": "Egypte", "MA": "Marokko",
    "NG": "Nigeria", "FI": "Finland", "IS": "IJsland", "NZ": "Nieuw-Zeeland",
    "MT": "Malta", "MU": "Mauritius", "HK": "Hongkong", "KW": "Koeweit",
    "QA": "Qatar", "CY": "Cyprus", "PE": "Peru", "CO": "Colombia", "VE": "Venezuela",
    "EC": "Ecuador", "BO": "Bolivië", "PY": "Paraguay", "UY": "Uruguay",
    "CD": "Democratische Republiek Congo",
    "CG": "Congo",
    "CM": "Kameroen",
    "KE": "Kenia",
    "TZ": "Tanzania",
    "UG": "Oeganda",
    "PG": "Papoea-Nieuw-Guinea",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "NP": "Nepal",
    "LK": "Sri Lanka",
    "MM": "Myanmar",
    "LA": "Laos",
    "KH": "Cambodja",
    "VN": "Vietnam",
    "DZ": "Algerije",
    "SD": "Soedan",
    "ET": "Ethiopië",
    "SS": "Zuid-Soedan",
    "CF": "Centraal-Afrikaanse Republiek",
    "GH": "Ghana",
    "GN": "Guinee"
};

function getCountryName(code) {
    return COUNTRY_MAP[code] || code;
}

// **********************************************
// ********** 3. API & DATATRANSFORMATIE **********
// **********************************************

async function testApiConnection() {
    statusMessage.textContent = "🔬 API-verbinding testen met OpenWeatherMap...";
    statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-blue-100 text-blue-700";

    const testParams = new URLSearchParams({ q: "London", limit: 1, appid: API_KEY, }).toString();

    try {
        const response = await fetch(`${GEO_API_URL}?${testParams}`);

        if (response.status === 200) {
            statusMessage.textContent = "✅ API-sleutel is geldig en actief. Kies een spel!";
            statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-green-100 text-green-700";
            return true;
        } else {
            statusMessage.textContent = "❌ FOUT (401/Netwerk): API-sleutel ongeldig of niet actief. Spellen vereisen live data.";
            statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-red-100 text-red-700 pulse";
            return false;
        }
    } catch (error) {
        statusMessage.textContent = "❌ Netwerkfout: Kan geen verbinding maken met de API-service.";
        statusMessage.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-red-100 text-red-700";
        return false;
    }
}

async function fetchTemperature(cityData, resultElement) {
    const forecastParams = new URLSearchParams({
        lat: cityData.lat, lon: cityData.lon, appid: API_KEY, units: 'metric'
    }).toString();

    try {
        const forecastResponse = await fetch(`${FORECAST_API_URL}?${forecastParams}`);
        const forecastData = await forecastResponse.json();

        if (forecastResponse.status !== 200) {
            resultElement.innerHTML = `<span class="text-red-500 font-medium">❌ Fout (${forecastResponse.status}): Kon voorspellingsdata niet ophalen.</span>`;
            return null;
        }

        let totalTemp = 0;
        let count = 0;
        let firstAvailableDate = null;

        if (forecastData.list && forecastData.list.length > 0) {
            firstAvailableDate = forecastData.list[0].dt_txt.slice(0, 10);
        } else {
             resultElement.innerHTML = `<span class="text-red-500 font-medium">❌ Fout: Geen voorspellingslijst beschikbaar.</span>`;
             return null;
        }

        for (const item of forecastData.list) {
            if (item.dt_txt.startsWith(firstAvailableDate)) {
                totalTemp += item.main.temp;
                count++;
            }
        }

        if (count === 0) {
            if (forecastData.list && forecastData.list.length > 0) {
                const singleTemp = forecastData.list[0].main.temp;
                const roundedTemp = Math.round(singleTemp);
                resultElement.innerHTML += `<br><span class="text-orange-500 font-medium">⚠️ Gebruikt enkele temperatuurmeting: ${roundedTemp}°C.</span>`;
                return roundedTemp;
            }

            resultElement.innerHTML = `<span class="text-red-500 font-medium">❌ Fout: Kon geen temperatuurmetingen vinden voor de dichtstbijzijnde dag.</span>`;
            return null;
        }

        const averageTemp = totalTemp / count;
        return Math.round(averageTemp);

    } catch (error) {
        resultElement.innerHTML = `<span class="text-red-500 font-medium">❌ Algemene Netwerkfout bij ophalen data.</span>`;
        return null;
    }
}

// --- Autocomplete Logica ---

async function fetchCitySuggestions(query, callback) {
    const geoParams = new URLSearchParams({
        q: query, limit: 2, appid: API_KEY,
    }).toString();

    try {
        const response = await fetch(`${GEO_API_URL}?${geoParams}`);
        const data = await response.json();
        callback(data);
    } catch (error) {
        console.error("Fout bij ophalen suggesties:", error);
        callback([]);
    }
}

function renderSuggestions(cities, container, submitButton, setCityData) {
    container.innerHTML = '';
    const seenKeys = new Set();
    submitButton.disabled = true;

    if (cities.length === 0) {
        container.classList.add('hidden');
        submitButton.disabled = false;
        return;
    }

    cities.forEach(city => {
        const cityKey = `${city.name.toLowerCase()}-${city.country}`;

        if (seenKeys.has(cityKey)) return;
        seenKeys.add(cityKey);

        const suggestionDiv = document.createElement('div');
        const countryName = getCountryName(city.country);
        let displayCityName = `${city.name}, ${countryName}`;

        suggestionDiv.textContent = displayCityName;
        suggestionDiv.className = 'suggestion-item';

        suggestionDiv.addEventListener('click', () => {
            const inputElement = container.previousElementSibling;
            inputElement.value = displayCityName;
            container.classList.add('hidden');

            setCityData({
                name: city.name,
                country: countryName,
                lat: city.lat,
                lon: city.lon
            });

            submitButton.disabled = false;
            inputElement.focus();
        });

        container.appendChild(suggestionDiv);
    });

    container.classList.remove('hidden');
}

function handleCityInput(event, gameType) {
    clearTimeout(debounceTimer);

    let cityInput, suggestionsContainer, submitButton, renderCallback, setCityData;

    if (gameType === 'deduction') {
        cityInput = document.getElementById('deduction-city-input');
        suggestionsContainer = document.getElementById('deduction-suggestions');
        submitButton = document.getElementById('deduction-submit-button');
        renderCallback = (cities) => renderSuggestions(cities, suggestionsContainer, submitButton, (city) => deductionSelectedCityData = city);
        setCityData = (city) => deductionSelectedCityData = city;
    } else {
        cityInput = document.getElementById('guessing-city-input');
        suggestionsContainer = document.getElementById('guessing-suggestions');
        submitButton = document.getElementById('guessing-submit-button');
        renderCallback = (cities) => renderSuggestions(cities, suggestionsContainer, submitButton, (city) => guessingSelectedCityData = city);
        setCityData = (city) => guessingSelectedCityData = city;
    }

    const query = event.target.value.trim();
    setCityData(null);
    submitButton.disabled = true;

    if (query.length < 4) {
        suggestionsContainer.classList.add('hidden');
        submitButton.disabled = false;
        return;
    }

    debounceTimer = setTimeout(() => {
        fetchCitySuggestions(query, renderCallback);
    }, DEBOUNCE_DELAY);
}

// **********************************************
// ********** 4. DEDUCTIE SPEL LOGICA ***********
// **********************************************

function updateDeductionDisplay() {
    const targetDisplay = document.getElementById('deduction-target-display');
    const turnsDisplay = document.getElementById('deduction-turns-display');

    targetDisplay.textContent = `${deductionTargetTemp.toFixed(0)}°C`;
    turnsDisplay.textContent = `${deductionTurnsLeft}/${DEDUCTION_MAX_TURNS}`;

    if (deductionTargetTemp < 0) {
        targetDisplay.classList.add('text-red-400');
    } else {
        targetDisplay.classList.remove('text-red-400');
    }
}

async function renderDeductionHistory() {
    const historyLog = document.getElementById('deduction-history-log');
    const historyPlaceholder = document.getElementById('deduction-history-placeholder');

    historyLog.innerHTML = '';
    if (deductionTurnHistory.length === 0) {
        historyPlaceholder.classList.remove('hidden');
        return;
    }
    historyPlaceholder.classList.add('hidden');

    deductionTurnHistory.slice().reverse().forEach((turn, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'text-gray-700 text-sm flex justify-between items-center p-2 rounded-lg transition duration-100 bg-gray-50 hover:bg-gray-100 border-l-4 border-red-400';

        listItem.innerHTML = `
            <span class="font-bold text-blue-700 mr-2">Worp ${DEDUCTION_MAX_TURNS - deductionTurnsLeft - index}:</span>
            <span>${turn.name}, ${turn.country}</span>
            <span class="font-black text-red-600">${turn.temp}°C</span>
        `;
        historyLog.appendChild(listItem);
    });
}

function initializeDeductionGame() {
    deductionTargetTemp = Math.floor(Math.random() * (DEDUCTION_MAX_TARGET - DEDUCTION_MIN_TARGET + 1)) + DEDUCTION_MIN_TARGET;
    deductionTurnsLeft = DEDUCTION_MAX_TURNS;
    gameActive = true;
    deductionTurnHistory = [];
    deductionSelectedCityData = null;

    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;
    document.getElementById('deduction-submit-button').textContent = "Trek Temperatuur Af";

    updateDeductionDisplay();
    renderDeductionHistory();

    document.getElementById('deduction-game-board').classList.remove('hidden');
    document.getElementById('deduction-end-screen').classList.add('hidden');
}

async function handleDeductionTurn() {
    if (!gameActive || deductionTurnsLeft === 0 || !deductionSelectedCityData) return;

    const cityData = deductionSelectedCityData;
    const deductionTurnResult = document.getElementById('deduction-turn-result');

    // 1. Controleer op duplicaten
    const keyToCheck = `${cityData.name.toLowerCase()}-${cityData.country.toLowerCase()}`;
    const isDuplicate = deductionTurnHistory.some(turn => `${turn.name.toLowerCase()}-${turn.country.toLowerCase()}` === keyToCheck);

    if (isDuplicate) {
        deductionTurnResult.innerHTML = `<span class="text-red-600 font-medium">❌ Fout: De stad '${cityData.name}, ${cityData.country}' is al gegokt. Kies een nieuwe stad!</span>`;
        deductionTurnResult.classList.remove('hidden');
        deductionSelectedCityData = null;
        document.getElementById('deduction-city-input').value = '';
        document.getElementById('deduction-submit-button').disabled = true;
        return;
    }

    // 2. Haal temperatuur op
    const temperature = await fetchTemperature(cityData, deductionTurnResult);

    if (temperature === null) {
        document.getElementById('deduction-submit-button').disabled = true;
        return;
    }

    // Bepaal thematische emoji
    const emoji = temperature > 25 ? '☀️' : temperature < 5 ? '❄️' : '☁️';

    // --- Succesvolle GOK ---
    const oldTarget = deductionTargetTemp;
    deductionTargetTemp -= temperature;
    deductionTurnsLeft--;

    deductionTurnHistory.push({ name: cityData.name, country: cityData.country, temp: temperature });

    deductionTurnResult.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${emoji}</span>
            <div>
                <p class="text-sm text-gray-700 font-medium">Afgetrokken (Daggemiddelde van ${cityData.name}, ${cityData.country}): ${temperature.toFixed(0)}°C</p>
                <p class="text-sm text-gray-700 mt-1">Nieuw Doel: ${oldTarget.toFixed(0)}°C - ${temperature.toFixed(0)}°C = <span class="font-bold text-xl text-blue-700">${deductionTargetTemp.toFixed(0)}°C</span></p>
            </div>
        </div>
    `;

    // UI en status reset
    deductionSelectedCityData = null;
    document.getElementById('deduction-city-input').value = '';
    document.getElementById('deduction-submit-button').disabled = true;

    updateDeductionDisplay();
    renderDeductionHistory();

    if (deductionTargetTemp <= 0 || deductionTurnsLeft === 0) {
        endDeductionGame();
    }
}

function endDeductionGame() {
    gameActive = false;
    document.getElementById('deduction-game-board').classList.add('hidden');
    document.getElementById('deduction-end-screen').classList.remove('hidden');
    document.getElementById('deduction-turn-result').classList.add('hidden');

    const score = deductionTargetTemp;

    if (score === 0) {
        document.getElementById('deduction-end-title').textContent = "🏆 PERFECTE SCORE! 🏆";
        document.getElementById('deduction-end-title').className = "text-4xl font-black mb-4 text-green-600";
        document.getElementById('deduction-end-message').textContent = "Je hebt precies 0°C bereikt! Meesterlijke strategie!";
    } else if (score > 0) {
        document.getElementById('deduction-end-title').textContent = "Einde Spel!";
        document.getElementById('deduction-end-title').className = "text-4xl font-black mb-4 text-yellow-700";
        document.getElementById('deduction-end-message').textContent = `De beurten zijn op. Je bent geëindigd met ${score.toFixed(0)}°C over. Score: ${score.toFixed(0)} punten.`;
    } else {
        document.getElementById('deduction-end-title').textContent = "🚨 Over De Schreef! 🚨";
        document.getElementById('deduction-end-title').className = "text-4xl font-black mb-4 text-red-600";
        document.getElementById('deduction-end-message').textContent = `Je hebt onder nul geëindigd met ${score.toFixed(0)}°C. Probeer de volgende keer beter in te schatten.`;
    }
}

// **********************************************
// ********** 5. RADEN SPEL LOGICA **************
// **********************************************

function updateGuessingDisplay() {
    const turnsDisplay = document.getElementById('guessing-turns-display');
    const targetDisplay = document.getElementById('guessing-target-display');

    turnsDisplay.textContent = `${guessingTurnsLeft}/${GUESSING_MAX_TURNS}`;
    targetDisplay.textContent = gameActive ? "??" : `${guessingSecretNumber}°C`;
    targetDisplay.classList.remove('text-green-600');
}

function renderGuessingHistory() {
    const historyLog = document.getElementById('guessing-history-log');
    const historyPlaceholder = document.getElementById('guessing-history-placeholder');

    historyLog.innerHTML = '';
    if (guessingTurnHistory.length === 0) {
        historyPlaceholder.classList.remove('hidden');
        return;
    }
    historyPlaceholder.classList.add('hidden');

    guessingTurnHistory.slice().reverse().forEach((turn, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'text-gray-700 text-sm flex justify-between items-center p-2 rounded-lg transition duration-100 bg-gray-50 hover:bg-gray-100 border-l-4 ' + turn.color;

        listItem.innerHTML = `
            <span class="font-bold text-gray-700 mr-2">Gok ${GUESSING_MAX_TURNS - guessingTurnsLeft - index}:</span>
            <span>${turn.name}, ${turn.country}</span>
            <span class="font-black ${turn.textColor}">${turn.guess}°C (${turn.feedback})</span>
        `;
        historyLog.appendChild(listItem);
    });
}

function initializeGuessingGame() {
    guessingSecretNumber = Math.floor(Math.random() * (GUESSING_MAX_TARGET - GUESSING_MIN_TARGET + 1)) + GUESSING_MIN_TARGET;
    guessingTurnsLeft = GUESSING_MAX_TURNS;
    gameActive = true;
    guessingTurnHistory = [];
    guessingSelectedCityData = null;

    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;
    document.getElementById('guessing-submit-button').textContent = "Controleer Temperatuur";

    updateGuessingDisplay();
    renderGuessingHistory();

    document.getElementById('guessing-game-board').classList.remove('hidden');
    document.getElementById('guessing-end-screen').classList.add('hidden');
}

async function handleGuessingTurn() {
    if (!gameActive || guessingTurnsLeft === 0 || !guessingSelectedCityData) return;

    const cityData = guessingSelectedCityData;
    const guessingTurnResult = document.getElementById('guessing-turn-result');

    const temperature = await fetchTemperature(cityData, guessingTurnResult);

    if (temperature === null) {
        document.getElementById('guessing-submit-button').disabled = true;
        return;
    }

    const guess = temperature;
    let feedback = '';
    let color = 'border-red-500';
    let textColor = 'text-red-600';

    if (guess === guessingSecretNumber) {
        feedback = 'GEWONNEN!';
        color = 'border-green-500';
        textColor = 'text-green-600';
        gameActive = false;
    } else if (guess < guessingSecretNumber) {
        feedback = 'HOGER';
        color = 'border-yellow-500';
        textColor = 'text-yellow-600';
    } else {
        feedback = 'LAGER';
        color = 'border-blue-500';
        textColor = 'text-blue-600';
    }

    guessingTurnsLeft--;

    guessingTurnHistory.push({
        name: cityData.name, country: cityData.country,
        guess: guess, feedback: feedback, color: color, textColor: textColor,
        lat: cityData.lat, lon: cityData.lon
    });

    const emoji = guess > 25 ? '☀️' : guess < 5 ? '❄️' : '☁️';

    guessingTurnResult.innerHTML = `
        <div class="result-content">
            <span class="temp-icon">${emoji}</span>
            <div>
                <p class="text-sm text-gray-700 font-medium">Temperatuur van ${cityData.name}, ${cityData.country}: <span class="font-bold ${textColor}">${guess}°C</span></p>
                <p class="text-sm text-gray-700 mt-1">Feedback: Het geheime getal is <span class="font-bold text-lg ${textColor}">${feedback}</span>.</p>
            </div>
        </div>
    `;

    // FIX: HIER ZAT DE FOUT. Het is een variabele, geen HTML element.
    guessingSelectedCityData = null;
    
    document.getElementById('guessing-city-input').value = '';
    document.getElementById('guessing-submit-button').disabled = true;

    updateGuessingDisplay();
    renderGuessingHistory();

    if (!gameActive || guessingTurnsLeft === 0) {
        endGuessingGame(guess === guessingSecretNumber);
    }
}

function endGuessingGame(won) {
    gameActive = false;
    document.getElementById('guessing-game-board').classList.add('hidden');
    document.getElementById('guessing-end-screen').classList.remove('hidden');
    document.getElementById('guessing-turn-result').classList.add('hidden');

    const titleElement = document.getElementById('guessing-end-title');
    const messageElement = document.getElementById('guessing-end-message');

    if (won) {
        titleElement.textContent = "🥳 GEVONDEN! 🥳";
        titleElement.className = "text-4xl font-black mb-4 text-green-600";
        messageElement.textContent = `Je hebt het geheime nummer (${guessingSecretNumber}) geraden in ${GUESSING_MAX_TURNS - guessingTurnsLeft} gokken!`;
    } else {
        titleElement.textContent = "❌ GAME OVER ❌";
        titleElement.className = "text-4xl font-black mb-4 text-red-600";
        messageElement.textContent = `Je beurten zijn op. Het geheime nummer was ${guessingSecretNumber}.`;
    }

    document.getElementById('guessing-target-display').textContent = `${guessingSecretNumber}°C`;
    if (won) document.getElementById('guessing-target-display').classList.add('text-green-600');
}

// **********************************************
// ********** 6. EVENT HANDLERS & INIT **********
// **********************************************

function showView(viewName) {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('deduction-game').classList.add('hidden');
    document.getElementById('guessing-game').classList.add('hidden');

    if (viewName === 'menu') {
        document.getElementById('main-menu').classList.remove('hidden');
        checkApiStatus();
    } else if (viewName === 'game') {
        document.getElementById('game-container').classList.remove('hidden');
    }
}

async function checkApiStatus() {
    document.getElementById('main-menu').classList.remove('hidden');
    const success = await testApiConnection();

    if (success) {
        document.getElementById('startGameButton').disabled = false;
        document.getElementById('startGameGuessButton').disabled = false;
    } else {
        document.getElementById('startGameButton').disabled = true;
        document.getElementById('startGameGuessButton').disabled = true;
    }
}

async function checkApiAndStart(gameType) {
    const apiIsActive = statusMessage.classList.contains('bg-green-100');

    if (apiIsActive || await testApiConnection()) {
        showView('game');
        if (gameType === 'deduction') {
            document.getElementById('deduction-game').classList.remove('hidden');
            initializeDeductionGame();
        } else if (gameType === 'guessing') {
            document.getElementById('guessing-game').classList.remove('hidden');
            initializeGuessingGame();
        }
    }
}

// --- Event Listeners toevoegen ---
document.getElementById('deduction-submit-button').addEventListener('click', handleDeductionTurn);
document.getElementById('deduction-city-input').addEventListener('input', (e) => handleCityInput(e, 'deduction'));
document.getElementById('deduction-city-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !document.getElementById('deduction-submit-button').disabled) {
        handleDeductionTurn();
    }
});

document.getElementById('guessing-submit-button').addEventListener('click', handleGuessingTurn);
document.getElementById('guessing-city-input').addEventListener('input', (e) => handleCityInput(e, 'guessing'));
document.getElementById('guessing-city-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !document.getElementById('guessing-submit-button').disabled) {
        handleGuessingTurn();
    }
});

// Start de initiële API-controle bij het laden van de pagina
window.onload = checkApiStatus;