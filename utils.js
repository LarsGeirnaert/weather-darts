import { API_KEY, FORECAST_API_URL, GEO_API_URL, REVERSE_GEO_API_URL, DEBOUNCE_DELAY } from './config.js';

const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });

export function getCountryName(code) {
    try { return regionNames.of(code); } catch (e) { return code; }
}

export function getFlagEmoji(countryCode) {
    if (!countryCode) return '';
    return `<span class="fi fi-${countryCode.toLowerCase()} shadow-sm rounded-[2px]" style="font-size: 1.2em; margin-left: 6px;"></span>`;
}

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
        const flag = getFlagEmoji(city.country);
        const countryName = getCountryName(city.country);

        div.innerHTML = `${city.name}, ${countryName} ${flag}`;
        div.className = 'suggestion-item';
        div.onclick = () => {
            const input = container.previousElementSibling;
            input.value = `${city.name}, ${countryName}`;
            container.classList.add('hidden');
            const cityData = { name: city.name, country: city.country, lat: city.lat, lon: city.lon };
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

let mapInstances = {};
let mapMarkers = {};

export function initMap(gameType, mapId, onLocationSelected) {
    if (mapInstances[gameType]) {
        mapInstances[gameType].invalidateSize();
        return;
    }
    const worldBounds = [[-90, -180], [90, 180]];
    const map = L.map(mapId, { minZoom: 2, maxBounds: worldBounds, maxBoundsViscosity: 1.0, worldCopyJump: false }).setView([20, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, noWrap: true, bounds: worldBounds, attribution: '&copy; OpenStreetMap' }).addTo(map);

    map.on('click', async (e) => {
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
                const cityData = { name: p.name, country: p.country, lat: p.lat, lon: p.lon };
                const countryName = getCountryName(p.country);
                onLocationSelected(cityData, `${p.name}, ${countryName}`);
            } else {
                onLocationSelected(null, "Geen stad gevonden.");
            }
        } catch (e) { console.error(e); }
    });
    mapInstances[gameType] = map;
}

/* ✨ VISUELE EFFECTEN ✨ */

// 1. Confetti Kanon
export function triggerWinConfetti() {
    const duration = 3000;
    const end = Date.now() + duration;
    (function frame() {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#3b82f6', '#ef4444', '#eab308'] });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#3b82f6', '#ef4444', '#eab308'] });
        if (Date.now() < end) requestAnimationFrame(frame);
    }());
}

// 2. Shake Effect
export function shakeElement(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.remove('shake');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('shake');
    }
}

// 3. Zwevende Schade/Punten Tekst
export function showFloatingText(targetElement, text, type = 'damage') {
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    const floatingDiv = document.createElement('div');
    floatingDiv.textContent = text;
    floatingDiv.className = `floating-text ${type === 'damage' ? 'text-damage' : 'text-heal'}`;
    floatingDiv.style.left = `${rect.left + rect.width / 2}px`;
    floatingDiv.style.top = `${rect.top}px`;
    document.body.appendChild(floatingDiv);
    setTimeout(() => { floatingDiv.remove(); }, 1500);
}