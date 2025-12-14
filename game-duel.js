import { db, ref, set, onValue, update } from './firebase.js';
import { fetchTemperature, setupCityInput } from './utils.js';

let currentRoomId = null;
let playerRole = null; 
let duelCityData = null;
let myUsedCities = new Set();
let isProcessingTurn = false;
let myChart = null; 

export function init() {
    const input = document.getElementById('duel-city-input');
    const btn = document.getElementById('duel-submit-btn');
    input.value = '';
    btn.disabled = true;
    
    myUsedCities.clear();

    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const codeInput = document.getElementById('room-code-input');

    const newCreate = createBtn.cloneNode(true);
    const newJoin = joinBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newCreate, createBtn);
    joinBtn.parentNode.replaceChild(newJoin, joinBtn);

    newCreate.onclick = () => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        createRoom(roomId);
    };

    newJoin.onclick = () => {
        const roomId = codeInput.value.toUpperCase().trim();
        if(roomId.length === 4) joinRoom(roomId);
    };

    setupCityInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (city) => {
        duelCityData = city;
    });

    const nextBtn = document.getElementById('next-round-btn');
    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    newNextBtn.onclick = setReadyForNextRound;
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
    document.getElementById('room-code-display').textContent = currentRoomId;

    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return; 

        document.getElementById('duel-target-display').textContent = `${data.targetTemp}°C`;
        document.getElementById('round-display').textContent = data.round;
        
        // HP BARS (Bovenaan)
        if (data.scores) {
            const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
            const oppScore = playerRole === 'host' ? data.scores.guest : data.scores.host;
            
            document.getElementById('p1-score-text').textContent = Math.round(myScore);
            document.getElementById('p2-score-text').textContent = Math.round(oppScore);

            const myPct = Math.max(0, Math.min(100, myScore));
            const oppPct = Math.max(0, Math.min(100, oppScore));

            document.getElementById('p1-hp-bar').style.width = `${myPct}%`;
            document.getElementById('p2-hp-bar').style.width = `${oppPct}%`;
        }

        if (data.history) {
            Object.values(data.history).forEach(item => {
                const myMove = playerRole === 'host' ? item.host : item.guest;
                if(myMove && myMove.guess) myUsedCities.add(myMove.guess);
            });
        }

        if (data.roundState === 'results') {
             isProcessingTurn = false;

             if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                 showDuelResults(data);
                 
                 const myData = playerRole === 'host' ? data.host : data.guest;
                 const btn = document.getElementById('next-round-btn');
                 
                 if (myData && myData.ready) {
                     btn.textContent = "⏳ Wachten op ander...";
                     btn.disabled = true;
                     btn.classList.add('opacity-50', 'cursor-not-allowed');
                 } else {
                     btn.textContent = "Volgende Ronde ➡️";
                     btn.disabled = false;
                     btn.classList.remove('opacity-50', 'cursor-not-allowed');
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
             document.getElementById('duel-waiting-msg').classList.add('hidden');
             document.getElementById('duel-submit-btn').classList.remove('hidden');
             document.getElementById('duel-submit-btn').textContent = "Kies & Wacht"; 
             
             const nextBtn = document.getElementById('next-round-btn');
             nextBtn.disabled = false;
             nextBtn.textContent = "Volgende Ronde ➡️";
             nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');

             const myData = playerRole === 'host' ? data.host : data.guest;
             const input = document.getElementById('duel-city-input');
             
             if (myData && myData.temp !== undefined) {
                 document.getElementById('duel-submit-btn').classList.add('hidden');
                 document.getElementById('duel-waiting-msg').classList.remove('hidden');
                 input.disabled = true;
             } else {
                 input.disabled = false;
                 if(duelCityData === null) input.value = '';
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
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    
    setupCityInput('duel-city-input', 'duel-suggestions', 'duel-submit-btn', (city) => {
        duelCityData = city;
    });

    newBtn.onclick = submitDuelGuess;
}

function setReadyForNextRound() {
    update(ref(db, `rooms/${currentRoomId}/${playerRole}`), {
        ready: true
    });
}

async function submitDuelGuess() {
    if (!duelCityData) return;

    if (myUsedCities.has(duelCityData.name)) {
        alert(`⚠️ Je hebt ${duelCityData.name} al gebruikt deze game! Kies een andere stad.`);
        return;
    }
    
    const input = document.getElementById('duel-city-input');
    const btn = document.getElementById('duel-submit-btn');
    
    input.disabled = true;
    btn.classList.add('hidden');
    document.getElementById('duel-waiting-msg').classList.remove('hidden');
    document.getElementById('duel-waiting-msg').textContent = "⏳ Wachten op tegenstander...";

    const temp = await fetchTemperature(duelCityData, null);

    if (temp !== null) {
        myUsedCities.add(duelCityData.name);
        update(ref(db, `rooms/${currentRoomId}/${playerRole}`), {
            guess: duelCityData.name,
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

    if (hostDiff < guestDiff) {
        const damage = (guestDiff - hostDiff) * round;
        newScores.guest -= damage;
    } else if (guestDiff < hostDiff) {
        const damage = (hostDiff - guestDiff) * round;
        newScores.host -= damage;
    }

    let nextState = 'results';
    if (newScores.host <= 0 || newScores.guest <= 0) {
        nextState = 'game_over';
    }

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

    document.getElementById('result-round-num').textContent = round;
    
    document.getElementById('p1-result-city').textContent = myData?.guess || "...";
    document.getElementById('p1-result-temp').textContent = `${myTemp}°C`; 
    document.getElementById('p1-diff').textContent = ""; 

    document.getElementById('p2-result-city').textContent = oppData?.guess || "...";
    document.getElementById('p2-result-temp').textContent = "???"; 
    document.getElementById('p2-diff').textContent = ""; 

    const banner = document.getElementById('winner-banner');
    const explanation = document.getElementById('damage-explanation');
    
    const baseDamage = Math.abs(myDiff - oppDiff);
    const totalDamage = baseDamage * round;

    if (myDiff < oppDiff) {
        banner.textContent = "🏆 JIJ WINT!";
        banner.className = "text-xl font-black text-green-600 mb-4";
        explanation.textContent = `Jij zat ${baseDamage}°C dichterbij! Tegenstander verliest ${totalDamage} punten.`;
    } else if (oppDiff < myDiff) {
        banner.textContent = "😢 VERLOREN...";
        banner.className = "text-xl font-black text-red-600 mb-4";
        explanation.textContent = `Tegenstander zat ${baseDamage}°C dichterbij! Jij verliest ${totalDamage} punten.`;
    } else {
        banner.textContent = "🤝 GELIJKSPEL!";
        banner.className = "text-xl font-black text-blue-600 mb-4";
        explanation.textContent = "Even ver weg. Niemand verliest punten.";
    }

    // --- NIEUW: UPDATE DE RESULT HP BAR ---
    const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
    const myPct = Math.max(0, Math.min(100, myScore));
    document.getElementById('result-hp-bar').style.width = `${myPct}%`;
    document.getElementById('result-hp-text').textContent = `${Math.round(myScore)} HP`;

    // GAME OVER KNOP
    const nextBtn = document.getElementById('next-round-btn');
    const gameOverBtn = document.getElementById('game-over-btn');

    if (data.scores && (data.scores.host <= 0 || data.scores.guest <= 0)) {
        nextBtn.classList.add('hidden');
        gameOverBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        gameOverBtn.classList.add('hidden');
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
        title.textContent = "🏆 GEWONNEN!";
        title.className = "text-4xl font-black text-center mb-6 text-green-600";
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    } else {
        title.textContent = "💀 GAME OVER";
        title.className = "text-4xl font-black text-center mb-6 text-red-600";
    }

    onValue(ref(db, `rooms/${currentRoomId}/history`), (snapshot) => {
        const history = snapshot.val();
        if (!history) return;

        const list = document.getElementById('summary-list');
        list.innerHTML = '';

        const sortedHistory = Object.values(history).sort((a, b) => a.round - b.round);
        
        let currentHostScore = 100;
        let currentGuestScore = 100;
        
        const hostScores = [100];
        const guestScores = [100];
        const roundLabels = ['Start'];

        sortedHistory.forEach(item => {
            const myMove = playerRole === 'host' ? item.host : item.guest;
            const oppMove = playerRole === 'host' ? item.guest : item.host;

            const hostDiff = item.host.diff;
            const guestDiff = item.guest.diff;
            const round = item.round;

            if (hostDiff < guestDiff) {
                const dmg = (guestDiff - hostDiff) * round;
                currentGuestScore -= dmg;
            } else if (guestDiff < hostDiff) {
                const dmg = (hostDiff - guestDiff) * round;
                currentHostScore -= dmg;
            }

            hostScores.push(Math.max(0, currentHostScore));
            guestScores.push(Math.max(0, currentGuestScore));
            roundLabels.push(`Ronde ${round}`);

            const li = document.createElement('li');
            li.className = "bg-gray-100 p-2 rounded border border-gray-200";
            
            li.innerHTML = `
                <div class="flex justify-between font-bold text-gray-700 border-b border-gray-300 pb-1 mb-1">
                    <span>Ronde ${item.round}</span>
                    <span class="text-blue-600">Doel: ${item.target}°C</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-green-700 font-semibold">Jij: ${myMove.guess} (${myMove.temp}°C)</span>
                    <span class="text-red-700">Zij: ${oppMove.guess} (${oppMove.temp}°C)</span>
                </div>
            `;
            list.appendChild(li);
        });

        const myScoreData = playerRole === 'host' ? hostScores : guestScores;
        const oppScoreData = playerRole === 'host' ? guestScores : hostScores;

        if(myChart) myChart.destroy();
        const ctx = document.getElementById('duel-chart');
        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: roundLabels,
                datasets: [
                    {
                        label: 'Mijn Score',
                        data: myScoreData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Tegenstander Score',
                        data: oppScoreData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.1,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        suggestedMax: 100,
                        title: { display: true, text: 'HP' }
                    }
                }
            }
        });

    }, { onlyOnce: true });
}