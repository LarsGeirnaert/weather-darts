// AANGEPASTE IMPORTS (../)
import { db, ref, set, onValue, update } from '../firebase.js';
import { fetchTemperature, setupCityInput, getFlagEmoji } from '../utils.js';

let currentRoomId = null;
let playerRole = null; 
let duelCityData = null;
let myUsedCities = new Set();
let isProcessingTurn = false;
let myChart = null; 
let lastKnownRound = 0;

// Helper: innerHTML voor vlaggen
function safeSetText(id, htmlContent) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = htmlContent;
}

function updateUsedCitiesUI() {
    const container = document.getElementById('used-cities-list');
    if (!container) return;
    
    container.innerHTML = '';
    myUsedCities.forEach(cityItem => {
        let displayHtml = cityItem;
        if (typeof cityItem === 'object') {
            displayHtml = `${cityItem.name} ${cityItem.flag}`;
        }
        const badge = document.createElement('span');
        badge.className = 'city-badge';
        badge.innerHTML = displayHtml; 
        container.appendChild(badge);
    });
}

function generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function init() {
    const input = document.getElementById('duel-city-input');
    const btn = document.getElementById('duel-submit-btn');
    if(input) input.value = '';
    if(btn) btn.disabled = true;
    
    myUsedCities.clear();
    updateUsedCitiesUI();
    lastKnownRound = 0;

    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const codeInput = document.getElementById('room-code-input');

    if(createBtn) {
        const newCreate = createBtn.cloneNode(true);
        createBtn.parentNode.replaceChild(newCreate, createBtn);
        newCreate.onclick = () => {
            const roomId = generateRoomId();
            createRoom(roomId);
        };
    }

    if(joinBtn && codeInput) {
        const newJoin = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newJoin, joinBtn);
        newJoin.onclick = () => {
            const roomId = codeInput.value.toUpperCase().trim();
            if(roomId.length === 4) joinRoom(roomId);
        };
    }

    setupCityInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (city) => {
        duelCityData = city;
    });

    const nextBtn = document.getElementById('next-round-btn');
    if(nextBtn) {
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.onclick = setReadyForNextRound;
    }
}

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
        guest: { status: 'empty', ready: false }
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
            if(input) input.value = '';
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

        if (data.history) {
            Object.values(data.history).forEach(item => {
                const myMove = playerRole === 'host' ? item.host : item.guest;
                if(myMove && myMove.guess) {
                    let exists = false;
                    // Check of het LAND al in de lijst staat
                    for(let elem of myUsedCities) {
                        if(elem.country === myMove.country) exists = true;
                    }
                    if(!exists) {
                        const flagHtml = getFlagEmoji(myMove.country);
                        // Sla nu ook de country code op in het object
                        myUsedCities.add({ name: myMove.guess, country: myMove.country, flag: flagHtml });
                    }
                }
            });
            updateUsedCitiesUI();
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
                         btn.classList.add('opacity-50', 'cursor-not-allowed');
                     } else {
                         btn.textContent = "Volgende Ronde ➡️";
                         btn.disabled = false;
                         btn.classList.remove('opacity-50', 'cursor-not-allowed');
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
             const submitBtn = document.getElementById('duel-submit-btn');
             if(submitBtn) submitBtn.textContent = "Kies & Wacht";
             const nextBtn = document.getElementById('next-round-btn');
             if(nextBtn) {
                 nextBtn.disabled = false;
                 nextBtn.textContent = "Volgende Ronde ➡️";
                 nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
             }
             const myData = playerRole === 'host' ? data.host : data.guest;
             const input = document.getElementById('duel-city-input');
             if (myData && myData.temp !== undefined) {
                 if(submitBtn) submitBtn.classList.add('hidden');
                 document.getElementById('duel-waiting-msg').classList.remove('hidden');
                 if(input) input.disabled = true;
             } else {
                 if(input) input.disabled = false;
                 document.getElementById('duel-waiting-msg').classList.add('hidden');
                 if(submitBtn) submitBtn.classList.remove('hidden');
             }
        }

        if (playerRole === 'host' && data.roundState === 'guessing' && !isProcessingTurn) {
            if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                isProcessingTurn = true; 
                calculateAndSaveScores(data);
            }
        }
    });

    const oldBtn = document.getElementById('duel-submit-btn');
    if(oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        setupCityInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (city) => {
            duelCityData = city;
        });
        newBtn.onclick = submitDuelGuess;
    }
}

function setReadyForNextRound() {
    update(ref(db, `rooms/${currentRoomId}/${playerRole}`), { ready: true });
}

async function submitDuelGuess() {
    if (!duelCityData) return;

    let countryUsed = false;
    // Loop door de lijst en check of het land al bestaat
    for(let elem of myUsedCities) {
        if(elem.country === duelCityData.country) countryUsed = true;
    }

    // Als land al gebruikt is, geef melding en stop
    if (countryUsed) {
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
        const flagHtml = getFlagEmoji(duelCityData.country);
        // Voeg toe aan de lijst MET country code
        myUsedCities.add({ name: duelCityData.name, country: duelCityData.country, flag: flagHtml });
        updateUsedCitiesUI();
        
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
    
    // --- JOUW DATA (Alles zichtbaar) ---
    safeSetText('p1-result-city', myData?.guess || "...");
    safeSetText('p1-result-temp', `${myTemp}°C`); 
    safeSetText('p1-diff', `(Afwijking: ${myDiff})`);

    // --- TEGENSTANDER DATA (Naam geheim, Temp zichtbaar) ---
    
    // 1. Verberg de NAAM (zodat ze niet weten welke stad deze temp heeft)
    safeSetText('p2-result-city', "🕵️ ???"); 

    // 2. Toon WEL de TEMPERATUUR (zodat je ziet wat er gebeurd is)
    safeSetText('p2-result-temp', `${oppTemp}°C`); 
    
    // 3. Toon eventueel ook de afwijking weer (optioneel, maar wel eerlijk)
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

        sortedHistory.forEach(item => {
            const myMove = playerRole === 'host' ? item.host : item.guest;
            const oppMove = playerRole === 'host' ? item.guest : item.host;
            const myFlag = getFlagEmoji(myMove.country);
            const oppFlag = getFlagEmoji(oppMove.country);
            const hostDiff = item.host.diff;
            const guestDiff = item.guest.diff;
            const round = item.round;

            if (hostDiff < guestDiff) currentGuestScore -= (guestDiff - hostDiff) * round;
            else if (guestDiff < hostDiff) currentHostScore -= (hostDiff - guestDiff) * round;

            hostScores.push(Math.max(0, currentHostScore));
            guestScores.push(Math.max(0, currentGuestScore));
            roundLabels.push(`Ronde ${round}`);

            if(list) {
                const li = document.createElement('li');
                li.className = "bg-gray-100 p-2 rounded border border-gray-200";
                li.innerHTML = `
                    <div class="flex justify-between font-bold text-gray-700 border-b border-gray-300 pb-1 mb-1">
                        <span>Ronde ${item.round}</span>
                        <span class="text-blue-600">Doel: ${item.target}°C</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-green-700 font-semibold">Jij: ${myMove.guess} ${myFlag} (${myMove.temp}°C)</span>
                        <span class="text-red-700">Zij: ${oppMove.guess} ${oppFlag} (${oppMove.temp}°C)</span>
                    </div>`;
                list.appendChild(li);
            }
        });

        const myScoreData = playerRole === 'host' ? hostScores : guestScores;
        const oppScoreData = playerRole === 'host' ? guestScores : hostScores;
        const ctx = document.getElementById('duel-chart');
        if(ctx) {
            if(myChart) myChart.destroy();
            myChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: roundLabels,
                    datasets: [
                        { label: 'Mijn Score', data: myScoreData, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', tension: 0.1, fill: true },
                        { label: 'Tegenstander Score', data: oppScoreData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.1, fill: true }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, suggestedMax: 100, title: { display: true, text: 'HP' } } } }
            });
        }
    }, { onlyOnce: true });
}