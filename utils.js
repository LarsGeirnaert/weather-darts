import { API_KEY, FORECAST_API_URL, GEO_API_URL, REVERSE_GEO_API_URL, DEBOUNCE_DELAY } from './config.js';

// --- Region Names ---
const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });
export function getCountryName(code) {
    try { return regionNames.of(code); } catch (e) { return code; }
}

// --- API Test ---
export async function testApiConnection() {
    const msg = document.getElementById('status-message');
    if(!msg) return;
    
    msg.textContent = "🔬 Verbinding testen...";
    
    try {
        const response = await fetch(`${GEO_API_URL}?q=London&limit=1&appid=${API_KEY}`);
        if (response.status === 200) {
            msg.textContent = "✅ Klaar om te spelen!";
            msg.className = "mt-8 font-bold text-green-600 text-sm animate-bounce";
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
    const params = new URLSearchParams({ q: query, limit: 5, appid: API_KEY }).toString();
    try {
        const response = await fetch(`${GEO_API_URL}?${params}`);
        callback(await response.json());
    } catch { callback([]); }
}

function renderSuggestions(cities, container, submitButton, onSelect) {
    container.innerHTML = '';
    const seen = new Set();
    if(submitButton) submitButton.disabled = true;

    if (cities.length === 0) { container.classList.add('hidden'); if(submitButton) submitButton.disabled = false; return; }

    cities.forEach(city => {
        const key = `${city.name}-${city.country}`;
        if (seen.has(key)) return;
        seen.add(key);

        const div = document.createElement('div');
        const displayName = `${city.name}, ${getCountryName(city.country)}`;
        div.textContent = displayName;
        div.className = 'suggestion-item';
        div.onclick = () => {
            const input = container.previousElementSibling;
            if(input) input.value = displayName;
            
            container.classList.add('hidden');
            const cityData = { name: city.name, country: getCountryName(city.country), lat: city.lat, lon: city.lon };
            onSelect(cityData);
            if(submitButton) submitButton.disabled = false;
        };
        container.appendChild(div);
    });
    container.classList.remove('hidden');
}

export function setupCityInput(inputId, suggestionsId, submitBtnId, onSelectCity) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(suggestionsId);
    const btn = document.getElementById(submitBtnId);

    if (!input || !container) return;

    input.addEventListener('input', (event) => {
        clearTimeout(debounceTimer);
        const query = event.target.value.trim();
        
        onSelectCity(null);
        if(btn) btn.disabled = true;

        if (query.length < 2) { container.classList.add('hidden'); return; }
        
        debounceTimer = setTimeout(() => {
            fetchCitySuggestions(query, (cities) => {
                renderSuggestions(cities, container, btn, onSelectCity);
            });
        }, DEBOUNCE_DELAY);
    });
}

// --- Map Logic (NUCLEAR OPTION: NO REPEAT) ---
let mapInstances = {};
let mapMarkers = {};

export function initMap(gameType, mapId, onLocationSelected) {
    if (mapInstances[gameType]) { 
        mapInstances[gameType].invalidateSize(); 
        return; 
    }
    
    // Wereldgrenzen definiëren
    const worldBounds = [[-90, -180], [90, 180]];

    const map = L.map(mapId, { 
        minZoom: 2, // Niet te ver uitzoomen
        maxBounds: worldBounds, // De camera mag hier niet buiten
        maxBoundsViscosity: 1.0, // Harde muur (geen stuiteren)
        worldCopyJump: false // Voorkom springen naar kopieën
    }).setView([20, 0], 2);
    
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19,
        noWrap: true, // CRUCIAAL: Stop het herhalen van tegels
        bounds: worldBounds, // Laad geen tegels buiten de wereld
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    
    map.on('click', async (e) => {
        // Zelfs met noWrap gebruiken we .wrap() voor de zekerheid, 
        // zodat de API altijd geldige coördinaten krijgt.
        const wrapped = e.latlng.wrap();
        const lat = wrapped.lat;
        const lon = wrapped.lng;
        
        if (mapMarkers[gameType]) map.removeLayer(mapMarkers[gameType]);
        mapMarkers[gameType] = L.marker([lat, lon]).addTo(map);

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