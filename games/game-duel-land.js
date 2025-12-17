import { db, ref, set, onValue, update } from '../firebase.js';
import { fetchTemperature } from '../utils.js';
import { API_KEY, GEO_API_URL, DEBOUNCE_DELAY } from '../config.js';

// --- STATE ---
let currentRoomId = null;
let playerRole = null; 
let selectedCountryData = null; 
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

// Interne helper om vlaggen te genereren
function getFlagHtml(countryCode) {
    if (!countryCode) return '';
    return `<span class="fi fi-${countryCode.toLowerCase()} shadow-sm rounded-[2px]" style="font-size: 1.2em; margin-left: 6px;"></span>`;
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
    console.log("🌍 Landen Duel Init");
    
    document.getElementById('duel-lobby').classList.remove('hidden');
    document.getElementById('duel-board').classList.add('hidden');
    document.getElementById('duel-result').classList.add('hidden');
    document.getElementById('duel-summary').classList.add('hidden');
    
    // 1. Knoppen Resetten
    const oldBtn = document.getElementById('duel-submit-btn');
    if(oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.onclick = submitLandGuess;
        newBtn.disabled = true;
        newBtn.classList.remove('hidden');
        newBtn.textContent = "Kies Land & Wacht";
    }

    setupButton('create-room-btn', () => createRoom(generateRoomId()));
    setupButton('join-room-btn', () => {
        const code = document.getElementById('room-code-input').value.toUpperCase().trim();
        if(code.length === 4) joinRoom(code);
    });
    setupButton('next-round-btn', setReadyForNextRound);

    // 2. UI Reset
    const input = document.getElementById('duel-city-input');
    const suggestions = document.getElementById('duel-suggestions');
    
    if(input) {
        input.value = '';
        input.placeholder = "Typ een land (NL of EN)...";
        input.disabled = false;
    }
    if(suggestions) suggestions.classList.add('hidden');
    
    // State Reset
    myUsedCountries.clear();
    // Leeg de visuele lijst ook direct
    const listContainer = document.getElementById('used-cities-list');
    if(listContainer) listContainer.innerHTML = '';

    lastKnownRound = 0;
    selectedCountryData = null;

    // 3. Input Setup
    setupCountryInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (country) => {
        selectedCountryData = country;
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

// --- INPUT & SUGGESTIES ---

function setupCountryInput(inputId, listId, btnId, onSelect) {
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
            let data = [];
            
            try {
                // 1. Zoek op naam
                let res = await fetch(`https://restcountries.com/v3.1/name/${query}`);
                if (res.ok) {
                    data = await res.json();
                } else {
                    // 2. Fallback: Zoek op vertaling
                    res = await fetch(`https://restcountries.com/v3.1/translation/${query}`);
                    if (res.ok) {
                        data = await res.json();
                    } else {
                        throw new Error("Niet gevonden");
                    }
                }

                // Filter en formatteer data
                const suggestions = data.slice(0, 5).map(c => ({
                    name: c.name.common,
                    dutchName: c.translations?.nld?.common || c.name.common,
                    capital: c.capital ? c.capital[0] : null,
                    code: c.cca2
                })).filter(c => c.capital);

                renderCountrySuggestions(suggestions, list, newInput, btn, onSelect);

            } catch(err) {
                list.classList.add('hidden');
            }
        }, DEBOUNCE_DELAY);
    });
}

function renderCountrySuggestions(countries, list, input, btn, onSelect) {
    list.innerHTML = '';
    if(countries.length === 0) {
        list.classList.add('hidden');
        return;
    }

    countries.forEach(country => {
        const div = document.createElement('div');
        div.className = 'p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex justify-between items-center transition-colors';
        
        const flagHtml = `<span class="fi fi-${country.code.toLowerCase()} shadow-sm rounded-[2px] text-xl"></span>`;
        
        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${flagHtml}
                <span class="font-bold text-slate-700">${country.dutchName}</span>
            </div>
            <span class="text-xs text-slate-400 italic">${country.capital}</span>
        `;
        
        div.onclick = () => {
            input.value = country.dutchName;
            list.classList.add('hidden');
            if(btn) btn.disabled = false;
            onSelect(country);
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
        mode: 'land'
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

        // Nieuwe ronde detectie
        if (data.round > lastKnownRound) {
            lastKnownRound = data.round;
            const input = document.getElementById('duel-city-input');
            if(input) {
                input.value = '';
                input.placeholder = "Typ een land (NL of EN)...";
                input.disabled = false;
            }
            selectedCountryData = null;
            const btn = document.getElementById('duel-submit-btn');
            if(btn) {
                btn.disabled = true;
                btn.classList.remove('hidden');
                btn.textContent = "Kies Land & Wacht";
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

        // --- HIER IS DE AANPASSING VOOR DE LIJST (Temp + Naam) ---
        if (data.history) {
            const container = document.getElementById('used-cities-list');
            if (container) {
                container.innerHTML = ''; 
                myUsedCountries.clear();
                
                Object.values(data.history).forEach(item => {
                    const myMove = playerRole === 'host' ? item.host : item.guest;
                    if (myMove && myMove.guess) {
                        // Badge met Naam + Vlag + Temp
                        const badge = document.createElement('div');
                        badge.className = 'flex items-center justify-between w-full bg-white/50 p-2 rounded-lg border-l-4 border-orange-400 shadow-sm mb-1';
                        badge.innerHTML = `
                            <div class="flex items-center gap-2">
                                ${getFlagHtml(myMove.countryCode)}
                                <span class="text-sm font-medium text-slate-700">${myMove.guess}</span>
                            </div>
                            <span class="text-sm font-black text-slate-800">${myMove.temp}°C</span>
                        `;
                        container.appendChild(badge);
                        
                        // Voeg toe aan validatie set
                        myUsedCountries.add(myMove.countryCode);
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

// --- ACTIES ---

async function submitLandGuess() {
    if (!selectedCountryData) return;

    if (myUsedCountries.has(selectedCountryData.code)) {
        alert(`⚠️ Je hebt ${selectedCountryData.dutchName} al gebruikt!`);
        return;
    }

    const input = document.getElementById('duel-city-input');
    const btn = document.getElementById('duel-submit-btn');
    if(input) input.disabled = true;
    if(btn) btn.classList.add('hidden');
    
    const waitMsg = document.getElementById('duel-waiting-msg');
    waitMsg.classList.remove('hidden');
    safeSetText('duel-waiting-msg', `🌍 Hoofdstad ${selectedCountryData.capital} zoeken...`);

    try {
        const geoRes = await fetch(`${GEO_API_URL}?q=${selectedCountryData.capital},${selectedCountryData.code}&limit=1&appid=${API_KEY}`);
        const geoData = await geoRes.json();

        if(!geoData || geoData.length === 0) {
            throw new Error("Hoofdstad locatie niet gevonden");
        }

        const location = { lat: geoData[0].lat, lon: geoData[0].lon };
        const temp = await fetchTemperature(location, null);

        if (temp !== null) {
            // Update UI gebeurt via de listener
            update(ref(db, `rooms/${currentRoomId}/${playerRole}`), {
                guess: selectedCountryData.dutchName,
                capital: selectedCountryData.capital,
                countryCode: selectedCountryData.code,
                temp: temp
            });
        }
    } catch (e) {
        console.error(e);
        safeSetText('duel-waiting-msg', "❌ Fout bij ophalen hoofdstad data.");
        if(input) input.disabled = false;
        if(btn) btn.classList.remove('hidden');
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
    
    // JIJ
    safeSetText('p1-result-city', `${myData?.guess} <br><span class="text-xs text-slate-400">(${myData?.capital})</span>`);
    safeSetText('p1-result-temp', `${myTemp}°C`); 
    safeSetText('p1-diff', `(Afwijking: ${myDiff})`);

    // TEGENSTANDER
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

function updateUsedCountriesUI() {
    // Deze functie wordt nu afgehandeld in waitForGameStart via data.history
}

function setReadyForNextRound() {
    update(ref(db, `rooms/${currentRoomId}/${playerRole}`), { ready: true });
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
        selectedCountryData = null;
    }, { onlyOnce: true });
}

// --- GAME OVER SUMMARY (MET GRAFIEK) ---

function showGameSummary(data) {
    document.getElementById('duel-play-area').classList.add('hidden');
    document.getElementById('duel-result').classList.add('hidden');
    document.getElementById('duel-summary').classList.remove('hidden');

    const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
    const title = document.getElementById('summary-title');
    if (myScore > 0) {
        safeSetText('summary-title', "🏆 GEWONNEN!");
        if(title) title.className = "text-4xl font-black text-center mb-6 text-green-600";
        if(typeof confetti === "function") confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    } else {
        safeSetText('summary-title', "💀 GAME OVER");
        if(title) title.className = "text-4xl font-black text-center mb-6 text-red-600";
    }

    onValue(ref(db, `rooms/${currentRoomId}/history`), (snapshot) => {
        const history = snapshot.val();
        if (!history) return;
        const list = document.getElementById('summary-list');
        if(list) list.innerHTML = '';
        
        const sortedHistory = Object.values(history).sort((a, b) => a.round - b.round);
        const hostScores = [100]; const guestScores = [100]; const roundLabels = ['Start'];
        let currentHostScore = 100; let currentGuestScore = 100;

        // Styling voor compacte layout
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

            // HP Berekening voor grafiek
            if (hostDiff < guestDiff) currentGuestScore -= (guestDiff - hostDiff) * round;
            else if (guestDiff < hostDiff) currentHostScore -= (hostDiff - guestDiff) * round;

            hostScores.push(Math.max(0, currentHostScore));
            guestScores.push(Math.max(0, currentGuestScore));
            roundLabels.push(`R ${round}`);

            if(list) {
                const li = document.createElement('li');
                li.className = "bg-white p-2 rounded-xl border border-gray-200 shadow-sm mb-2";
                li.innerHTML = `
                    <div class="flex justify-between items-center font-bold text-slate-700 border-b border-slate-100 pb-2 mb-2">
                        <span class="bg-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded-full uppercase tracking-wider">Ronde ${item.round}</span>
                        <span class="text-blue-600 text-xs">Doel: ${item.target}°C</span>
                    </div>
                    <div class="space-y-2">
                        <div class="flex justify-between items-center text-xs">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-green-600 w-6">JIJ</span>
                                ${getFlagHtml(myMove.countryCode)}
                                <span class="text-slate-700">${myMove.guess}</span>
                            </div>
                            <span class="font-mono font-bold text-slate-800">${myMove.temp}°C</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-red-600 w-6">ZIJ</span>
                                ${getFlagHtml(oppMove.countryCode)}
                                <span class="text-slate-700">${oppMove.guess}</span>
                            </div>
                            <span class="font-mono font-bold text-slate-800">${oppMove.temp}°C</span>
                        </div>
                    </div>`;
                list.appendChild(li);
            }
        });

        // Grafiek tekenen met timeout
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