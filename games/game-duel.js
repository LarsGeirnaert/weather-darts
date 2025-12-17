import { db, ref, set, onValue, update } from '../firebase.js';
import { fetchTemperature } from '../utils.js';
import { DEBOUNCE_DELAY } from '../config.js';

// --- STATE ---
let currentRoomId = null;
let playerRole = null; 
let duelCityData = null;
let myUsedCountries = new Set(); 
let isProcessingTurn = false;
let myChart = null; 
let lastKnownRound = 0;
let debounceTimer = null;

// --- HELPERS ---

function safeSetText(id, htmlContent) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = htmlContent;
}

function getFlagHtml(countryCode) {
    if (!countryCode) return '';
    return `<span class="fi fi-${countryCode.toLowerCase()} shadow-sm rounded-[2px]" style="font-size: 1.2em; margin-left: 6px;"></span>`;
}

const regionNames = new Intl.DisplayNames(['nl'], { type: 'region' });
function getCountryName(code) {
    try { return regionNames.of(code); } catch (e) { return code; }
}

function generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- INIT ---

export function init() {
    console.log("🏙️ Steden Duel Init");
    document.getElementById('duel-lobby').classList.remove('hidden');
    document.getElementById('duel-board').classList.add('hidden');
    document.getElementById('duel-result').classList.add('hidden');
    document.getElementById('duel-summary').classList.add('hidden');

    const oldBtn = document.getElementById('duel-submit-btn');
    if(oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.onclick = submitDuelGuess;
        newBtn.disabled = true;
        newBtn.classList.remove('hidden');
        newBtn.textContent = "Kies & Wacht";
    }

    setupButton('create-room-btn', () => createRoom(generateRoomId()));
    setupButton('join-room-btn', () => {
        const code = document.getElementById('room-code-input').value.toUpperCase().trim();
        if(code.length === 4) joinRoom(code);
    });
    setupButton('next-round-btn', setReadyForNextRound);

    const input = document.getElementById('duel-city-input');
    const suggestions = document.getElementById('duel-suggestions');

    if(input) {
        input.value = '';
        input.placeholder = "Typ een stad (bv. Helsinki)...";
        input.disabled = false;
    }
    if(suggestions) suggestions.classList.add('hidden');
    
    // Reset state
    myUsedCountries.clear();
    // Leeg de lijst visueel ook direct bij start
    const listContainer = document.getElementById('used-cities-list');
    if(listContainer) listContainer.innerHTML = '';

    lastKnownRound = 0;
    duelCityData = null;

    setupCityInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (city) => {
        duelCityData = city;
    });
}

function setupButton(id, handler) {
    const el = document.getElementById(id);
    if(el) {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.onclick = handler;
    }
}

// --- INPUT & SUGGESTIES (MET FILTER) ---

function setupCityInput(inputId, listId, btnId, onSelect) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const btn = document.getElementById(btnId);

    if(!input || !list) return;

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if(btn) btn.disabled = true;
        onSelect(null);
        clearTimeout(debounceTimer);
        if(query.length < 2) {
            list.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=10&language=nl&format=json`);
                if (!res.ok) throw new Error("Fout");
                const data = await res.json();
                
                if (!data.results) {
                    list.classList.add('hidden');
                    return;
                }

                // --- FILTER: GEEN LANDEN ---
                const suggestions = data.results
                    .filter(city => {
                        // We willen alleen 'Populated Places' (P...), geen Landen (PCL...)
                        // Als feature_code PCLI, PCLD, etc is, is het een land -> verberg het
                        if (!city.feature_code) return true; 
                        return city.feature_code.startsWith('P') && !city.feature_code.startsWith('PCL');
                    })
                    .slice(0, 5) // Pak de top 5 NA filtratie
                    .map(city => ({
                        name: city.name,
                        country: city.country_code,
                        state: city.admin1 || '',
                        lat: city.latitude,
                        lon: city.longitude
                    }));

                renderCitySuggestions(suggestions, list, newInput, btn, onSelect);
            } catch(err) {
                console.error(err);
                list.classList.add('hidden');
            }
        }, DEBOUNCE_DELAY);
    });
}

function renderCitySuggestions(cities, list, input, btn, onSelect) {
    list.innerHTML = '';
    if(cities.length === 0) {
        list.classList.add('hidden');
        return;
    }
    const seen = new Set();
    cities.forEach(city => {
        const key = `${city.name}-${city.country}-${city.state}`;
        if (seen.has(key)) return;
        seen.add(key);

        const div = document.createElement('div');
        div.className = 'p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 flex justify-between items-center transition-colors';
        const flagHtml = getFlagHtml(city.country);
        const countryName = getCountryName(city.country);
        const stateText = city.state ? `<span class="text-xs text-slate-400">(${city.state})</span>` : '';

        div.innerHTML = `
            <div class="flex items-center gap-2">
                ${flagHtml}
                <span class="font-bold text-slate-700">${city.name}</span>
                ${stateText}
            </div>
            <span class="text-xs text-slate-400 italic">${countryName}</span>
        `;
        
        div.onclick = () => {
            input.value = `${city.name}, ${countryName}`; 
            list.classList.add('hidden');
            if(btn) btn.disabled = false;
            onSelect(city);
        };
        list.appendChild(div);
    });
    list.classList.remove('hidden');
}

// --- FIREBASE LOGICA ---

function createRoom(roomId) {
    currentRoomId = roomId;
    playerRole = 'host';
    const initialTarget = Math.floor(Math.random() * 35) - 5; 
    set(ref(db, 'rooms/' + roomId), {
        targetTemp: initialTarget,
        scores: { host: 100, guest: 100 },
        round: 1,
        roundState: 'guessing',
        host: { status: 'waiting', ready: false },
        guest: { status: 'empty', ready: false },
        mode: 'city'
    });
    waitForGameStart();
}

function joinRoom(roomId) {
    currentRoomId = roomId;
    playerRole = 'guest';
    update(ref(db, 'rooms/' + roomId + '/guest'), { status: 'joined', ready: false });
    waitForGameStart();
}

function waitForGameStart() {
    document.getElementById('duel-lobby').classList.add('hidden');
    document.getElementById('duel-board').classList.remove('hidden');
    safeSetText('room-code-display', currentRoomId);

    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return; 

        if (data.round > lastKnownRound) {
            lastKnownRound = data.round;
            const input = document.getElementById('duel-city-input');
            if(input) {
                input.value = '';
                input.placeholder = "Typ een stad...";
                input.disabled = false;
            }
            duelCityData = null;
            const btn = document.getElementById('duel-submit-btn');
            if(btn) {
                btn.disabled = true;
                btn.classList.remove('hidden');
                btn.textContent = "Kies & Wacht";
            }
            document.getElementById('duel-waiting-msg').classList.add('hidden');
        }

        safeSetText('duel-target-display', `${data.targetTemp}°C`);
        safeSetText('round-display', data.round);
        
        if (data.scores) {
            const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
            const oppScore = playerRole === 'host' ? data.scores.guest : data.scores.host;
            safeSetText('p1-score-text', Math.round(myScore));
            safeSetText('p2-score-text', Math.round(oppScore));
            const p1Bar = document.getElementById('p1-hp-bar');
            const p2Bar = document.getElementById('p2-hp-bar');
            if(p1Bar) p1Bar.style.width = `${Math.max(0, Math.min(100, myScore))}%`;
            if(p2Bar) p2Bar.style.width = `${Math.max(0, Math.min(100, oppScore))}%`;
        }

        // --- UPDATE "AL GEKOZEN" LIJST MET TEMP & STAD ---
        if (data.history) {
            const container = document.getElementById('used-cities-list');
            if (container) {
                container.innerHTML = ''; 
                myUsedCountries.clear(); // Reset validatie set
                
                Object.values(data.history).forEach(item => {
                    // Haal mijn zet op uit de geschiedenis
                    const myMove = playerRole === 'host' ? item.host : item.guest;
                    
                    if (myMove && myMove.guess) {
                        // Voeg toe aan validatie (zodat je het land niet nog eens kiest)
                        if(myMove.country) myUsedCountries.add(myMove.country);

                        // Maak de badge met Naam + Vlag + Temperatuur
                        const badge = document.createElement('div');
                        badge.className = 'flex items-center justify-between w-full bg-white/50 p-2 rounded-lg border-l-4 border-orange-400 shadow-sm mb-1';
                        
                        badge.innerHTML = `
                            <div class="flex items-center gap-2">
                                ${getFlagHtml(myMove.country)}
                                <span class="text-sm font-medium text-slate-700">${myMove.guess}</span>
                            </div>
                            <span class="text-sm font-black text-slate-800">${myMove.temp}°C</span>
                        `;
                        container.appendChild(badge);
                    }
                });
            }
        }

        if (data.roundState === 'results') {
             isProcessingTurn = false;
             if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                 showDuelResults(data);
                 
                 const myData = playerRole === 'host' ? data.host : data.guest;
                 const btn = document.getElementById('next-round-btn');
                 if (btn) {
                     if (myData && myData.ready) {
                         btn.textContent = "⏳ Wachten op ander...";
                         btn.disabled = true;
                         btn.classList.add('opacity-50');
                     } else {
                         btn.textContent = "Volgende Ronde ➡️";
                         btn.disabled = false;
                         btn.classList.remove('opacity-50');
                     }
                 }
                 if (playerRole === 'host' && data.host?.ready && data.guest?.ready) {
                     startNextRound();
                 }
             }
        } else if (data.roundState === 'game_over') {
             showGameSummary(data);
        } else {
             isProcessingTurn = false;
             document.getElementById('duel-result').classList.add('hidden');
             document.getElementById('duel-play-area').classList.remove('hidden');
             
             const myData = playerRole === 'host' ? data.host : data.guest;
             const input = document.getElementById('duel-city-input');
             const submitBtn = document.getElementById('duel-submit-btn');

             if (myData && myData.temp !== undefined) {
                 if(submitBtn) submitBtn.classList.add('hidden');
                 document.getElementById('duel-waiting-msg').classList.remove('hidden');
                 safeSetText('duel-waiting-msg', "⏳ Wachten op tegenstander...");
                 if(input) input.disabled = true;
             }
        }

        if (playerRole === 'host' && data.roundState === 'guessing' && !isProcessingTurn) {
            if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                isProcessingTurn = true; 
                calculateAndSaveScores(data);
            }
        }
    });
}

function setReadyForNextRound() {
    update(ref(db, `rooms/${currentRoomId}/${playerRole}`), { ready: true });
}

async function submitDuelGuess() {
    if (!duelCityData) return;

    if (myUsedCountries.has(duelCityData.country)) {
        alert(`⚠️ Je hebt al een stad uit ${duelCityData.country} gekozen! Kies een ander land.`);
        return;
    }
    
    const input = document.getElementById('duel-city-input');
    const btn = document.getElementById('duel-submit-btn');
    if(input) input.disabled = true;
    if(btn) btn.classList.add('hidden');
    document.getElementById('duel-waiting-msg').classList.remove('hidden');
    safeSetText('duel-waiting-msg', "⏳ Wachten op tegenstander...");

    const temp = await fetchTemperature(duelCityData, null);

    if (temp !== null) {
        // We updaten de UI hier niet handmatig, dat doet de onValue listener via data.history
        update(ref(db, `rooms/${currentRoomId}/${playerRole}`), {
            guess: duelCityData.name,
            country: duelCityData.country,
            temp: temp
        });
    }
}

function calculateAndSaveScores(data) {
    const target = data.targetTemp;
    const hostData = data.host;
    const guestData = data.guest;
    const round = data.round;
    let newScores = { ...data.scores };
    const hostDiff = Math.abs(target - hostData.temp);
    const guestDiff = Math.abs(target - guestData.temp);
    const historyItem = {
        round: round,
        target: target,
        host: { ...hostData, diff: hostDiff },
        guest: { ...guestData, diff: guestDiff }
    };

    if (hostDiff < guestDiff) newScores.guest -= (guestDiff - hostDiff) * round;
    else if (guestDiff < hostDiff) newScores.host -= (hostDiff - guestDiff) * round;

    let nextState = 'results';
    if (newScores.host <= 0 || newScores.guest <= 0) nextState = 'game_over';

    const updates = {};
    updates[`rooms/${currentRoomId}/scores`] = newScores;
    updates[`rooms/${currentRoomId}/roundState`] = nextState;
    updates[`rooms/${currentRoomId}/history/round_${round}`] = historyItem;
    update(ref(db), updates);
}

function showDuelResults(data) {
    document.getElementById('duel-play-area').classList.add('hidden');
    document.getElementById('duel-result').classList.remove('hidden');

    const myData = playerRole === 'host' ? data.host : data.guest;
    const oppData = playerRole === 'host' ? data.guest : data.host;
    const target = data.targetTemp;
    const round = data.round;
    const myTemp = myData ? myData.temp : 0;
    const oppTemp = oppData ? oppData.temp : 0;
    const myDiff = Math.abs(target - myTemp);
    const oppDiff = Math.abs(target - oppTemp);

    safeSetText('result-round-num', round);
    
    // JIJ: Alles zichtbaar
    safeSetText('p1-result-city', `${myData?.guess} ${getFlagHtml(myData?.country)}`);
    safeSetText('p1-result-temp', `${myTemp}°C`); 
    safeSetText('p1-diff', `(Afwijking: ${myDiff})`);

    // TEGENSTANDER: Geheim
    safeSetText('p2-result-city', "🕵️ ???"); 
    safeSetText('p2-result-temp', `${oppTemp}°C`); 
    safeSetText('p2-diff', `(Afwijking: ${oppDiff})`); 

    const banner = document.getElementById('winner-banner');
    const explanation = document.getElementById('damage-explanation');
    const baseDamage = Math.abs(myDiff - oppDiff);
    const totalDamage = baseDamage * round;

    if (myDiff < oppDiff) {
        if(banner) { banner.textContent = "🏆 JIJ WINT!"; banner.className = "text-3xl font-black text-green-500 mb-6 drop-shadow-sm"; }
        if(explanation) explanation.textContent = `Jij zat ${baseDamage}°C dichterbij! Tegenstander verliest ${totalDamage} punten.`;
    } else if (oppDiff < myDiff) {
        if(banner) { banner.textContent = "😢 VERLOREN..."; banner.className = "text-3xl font-black text-red-500 mb-6 drop-shadow-sm"; }
        if(explanation) explanation.textContent = `Tegenstander zat ${baseDamage}°C dichterbij! Jij verliest ${totalDamage} punten.`;
    } else {
        if(banner) { banner.textContent = "🤝 GELIJKSPEL!"; banner.className = "text-3xl font-black text-blue-500 mb-6 drop-shadow-sm"; }
        if(explanation) explanation.textContent = "Even ver weg. Niemand verliest punten.";
    }

    const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
    const myPct = Math.max(0, Math.min(100, myScore));
    const resultHpBar = document.getElementById('result-hp-bar');
    const resultHpText = document.getElementById('result-hp-text');
    if(resultHpBar) resultHpBar.style.width = `${myPct}%`;
    if(resultHpText) resultHpText.textContent = `${Math.round(myScore)} HP`;

    const nextBtn = document.getElementById('next-round-btn');
    const gameOverBtn = document.getElementById('game-over-btn');
    if (data.scores && (data.scores.host <= 0 || data.scores.guest <= 0)) {
        if(nextBtn) nextBtn.classList.add('hidden');
        if(gameOverBtn) gameOverBtn.classList.remove('hidden');
    } else {
        if(nextBtn) nextBtn.classList.remove('hidden');
        if(gameOverBtn) gameOverBtn.classList.add('hidden');
    }
}

function startNextRound() {
    onValue(ref(db, `rooms/${currentRoomId}/round`), (snapshot) => {
        const currentRound = snapshot.val();
        const newTarget = Math.floor(Math.random() * 35) - 5;
        update(ref(db, `rooms/${currentRoomId}`), {
            targetTemp: newTarget,
            round: currentRound + 1,
            roundState: 'guessing',
            host: { status: 'playing', guess: null, temp: null, ready: false },
            guest: { status: 'playing', guess: null, temp: null, ready: false }
        });
        duelCityData = null;
    }, { onlyOnce: true });
}

function updateUsedCountriesUI() {
    // Deze functie wordt nu volledig afgehandeld door de listener in waitForGameStart
    // omdat we de temperatuur data uit de history nodig hebben.
}

// --- GAME OVER SUMMARY (MET GRAFIEK FIX) ---

function showGameSummary(data) {
    document.getElementById('duel-play-area').classList.add('hidden');
    document.getElementById('duel-result').classList.add('hidden');
    document.getElementById('duel-summary').classList.remove('hidden');

    const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
    const title = document.getElementById('summary-title');
    if (myScore > 0) {
        safeSetText('summary-title', "🏆 GEWONNEN!");
        if(title) title.className = "text-3xl font-black text-center mb-4 text-green-600";
        if(typeof confetti === "function") confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    } else {
        safeSetText('summary-title', "💀 GAME OVER");
        if(title) title.className = "text-3xl font-black text-center mb-4 text-red-600";
    }

    onValue(ref(db, `rooms/${currentRoomId}/history`), (snapshot) => {
        const history = snapshot.val();
        if (!history) return;
        const list = document.getElementById('summary-list');
        if(list) list.innerHTML = '';
        
        const sortedHistory = Object.values(history).sort((a, b) => a.round - b.round);
        
        // Data voor grafiek
        const hostScores = [100]; const guestScores = [100]; const roundLabels = ['Start'];
        let currentHostScore = 100; let currentGuestScore = 100;

        const chartCanvas = document.getElementById('duel-chart');
        if(chartCanvas) {
             chartCanvas.parentElement.className = "mb-2 w-full h-40 bg-slate-50 rounded-xl p-2 border border-slate-100 relative";
        }
        
        const listParent = document.querySelector('#duel-summary .max-h-60');
        if(listParent) {
            listParent.className = "bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-4 text-left h-48 overflow-y-auto shadow-inner";
        }

        sortedHistory.forEach(item => {
            const myMove = playerRole === 'host' ? item.host : item.guest;
            const oppMove = playerRole === 'host' ? item.guest : item.host;
            const hostDiff = item.host.diff;
            const guestDiff = item.guest.diff;
            const round = item.round;

            // Bereken score verloop voor grafiek
            if (hostDiff < guestDiff) currentGuestScore -= (guestDiff - hostDiff) * round;
            else if (guestDiff < hostDiff) currentHostScore -= (hostDiff - guestDiff) * round;

            hostScores.push(Math.max(0, currentHostScore));
            guestScores.push(Math.max(0, currentGuestScore));
            roundLabels.push(`R ${round}`);

            if(list) {
                const li = document.createElement('li');
                li.className = "bg-white p-2 rounded-xl border border-gray-200 shadow-sm mb-2";
                li.innerHTML = `
                    <div class="flex justify-between items-center font-bold text-slate-700 border-b border-slate-100 pb-1 mb-1">
                        <span class="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Ronde ${item.round}</span>
                        <span class="text-blue-600 text-xs">Doel: ${item.target}°C</span>
                    </div>
                    <div class="space-y-1">
                        <div class="flex justify-between items-center text-xs">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-green-600 w-6">JIJ</span>
                                ${getFlagHtml(myMove.country)}
                                <span class="text-slate-700">${myMove.guess}</span>
                            </div>
                            <span class="font-mono font-bold text-slate-800">${myMove.temp}°C</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-red-600 w-6">ZIJ</span>
                                ${getFlagHtml(oppMove.country)}
                                <span class="text-slate-700">${oppMove.guess}</span>
                            </div>
                            <span class="font-mono font-bold text-slate-800">${oppMove.temp}°C</span>
                        </div>
                    </div>`;
                list.appendChild(li);
            }
        });

        // Grafiek tekenen met timeout om renderen te garanderen
        setTimeout(() => {
            if(myChart) myChart.destroy();
            if(chartCanvas) {
                const myScoreData = playerRole === 'host' ? hostScores : guestScores;
                const oppScoreData = playerRole === 'host' ? guestScores : hostScores;

                myChart = new Chart(chartCanvas, {
                    type: 'line',
                    data: {
                        labels: roundLabels,
                        datasets: [
                            { label: 'Jij', data: myScoreData, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderWidth: 3, tension: 0.3, fill: true, pointRadius: 3 },
                            { label: 'Tegenstander', data: oppScoreData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, tension: 0.3, fill: true, pointRadius: 3 }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { legend: { display: false } },
                        scales: { 
                            y: { beginAtZero: true, suggestedMax: 100, grid: { display: false } },
                            x: { grid: { display: false } }
                        } 
                    }
                });
            }
        }, 150);
    }, { onlyOnce: true });
}