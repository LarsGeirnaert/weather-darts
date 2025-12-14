import { API_KEY, FORECAST_API_URL, GEO_API_URL, REVERSE_GEO_API_URL, DEBOUNCE_DELAY } from './config.js';

// --- Region Names ---
const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });
export function getCountryName(code) {
    try { return regionNames.of(code); } catch (e) { return code; }
}

// --- API Test ---
export async function testApiConnection() {
    const msg = document.getElementById('status-message');
    msg.textContent = "🔬 Verbinding testen...";
    msg.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-blue-100 text-blue-700 text-sm";
    
    try {
        const response = await fetch(`${GEO_API_URL}?q=London&limit=1&appid=${API_KEY}`);
        if (response.status === 200) {
            msg.textContent = "✅ Klaar om te spelen!";
            msg.className = "text-center p-3 mt-8 rounded-lg font-semibold bg-green-100 text-green-700 text-sm";
            return true;
        }
        return false;
    } catch { return false; }
}

// --- Fetch Temp ---
export async function fetchTemperature(cityData, resultElement) {
    const params = new URLSearchParams({ lat: cityData.lat, lon: cityData.lon, appid: API_KEY, units: 'metric' }).toString();
    try {
        const response = await fetch(`${FORECAST_API_URL}?${params}`);
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

// --- Autocomplete Logic ---
let debounceTimer;

async function fetchCitySuggestions(query, callback) {
    const params = new URLSearchParams({ q: query, limit: 2, appid: API_KEY }).toString();
    try {
        const response = await fetch(`${GEO_API_URL}?${params}`);
        callback(await response.json());
    } catch { callback([]); }
}

function renderSuggestions(cities, container, submitButton, onSelect) {
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
            const cityData = { name: city.name, country: getCountryName(city.country), lat: city.lat, lon: city.lon };
            onSelect(cityData);
            submitButton.disabled = false;
        };
        container.appendChild(div);
    });
    container.classList.remove('hidden');
}

export function setupCityInput(inputId, suggestionsId, submitBtnId, onSelectCity) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(suggestionsId);
    const btn = document.getElementById(submitBtnId);

    input.addEventListener('input', (event) => {
        clearTimeout(debounceTimer);
        const query = event.target.value.trim();
        
        onSelectCity(null); // Reset selectie bij typen
        btn.disabled = true;

        if (query.length < 3) { container.classList.add('hidden'); btn.disabled = false; return; }
        
        debounceTimer = setTimeout(() => {
            fetchCitySuggestions(query, (cities) => {
                renderSuggestions(cities, container, btn, onSelectCity);
            });
        }, DEBOUNCE_DELAY);
    });
}

// --- Map Logic ---
let mapInstances = {};
let mapMarkers = {};

export function initMap(gameType, mapId, onLocationSelected) {
    if (mapInstances[gameType]) { mapInstances[gameType].invalidateSize(); return; }
    
    const map = L.map(mapId).setView([52.0, 5.0], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    
    map.on('click', async (e) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        
        if (mapMarkers[gameType]) map.removeLayer(mapMarkers[gameType]);
        mapMarkers[gameType] = L.marker([lat, lon]).addTo(map);

        // Notify that loading started
        onLocationSelected(null, "Zoeken...");

        try {
            const res = await fetch(`${REVERSE_GEO_API_URL}?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`);
            const data = await res.json();
            if (data.length > 0) {
                const p = data[0];
                const cityData = { name: p.name, country: getCountryName(p.country), lat: p.lat, lon: p.lon };
                onLocationSelected(cityData, `${p.name}, ${cityData.country}`);
            } else {
                onLocationSelected(null, "Geen stad gevonden.");
            }
        } catch (e) { console.error(e); }
    });
    
    mapInstances[gameType] = map;
}