import { db, ref, set, onValue, update } from './firebase.js'; // Let op: 'push' is hier niet meer nodig
import { fetchTemperature, setupCityInput } from './utils.js';

let currentRoomId = null;
let playerRole = null; 
let duelCityData = null;
let myUsedCities = new Set();
let isProcessingTurn = false; // Voorkomt dubbele berekeningen

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
        
        if (data.scores) {
            const myScore = playerRole === 'host' ? data.scores.host : data.scores.guest;
            const oppScore = playerRole === 'host' ? data.scores.guest : data.scores.host;
            document.getElementById('my-score').textContent = Math.round(myScore);
            document.getElementById('opp-score').textContent = Math.round(oppScore);
        }

        // Haal gebruikte steden op uit historie (tegen refreshen)
        if (data.history) {
            Object.values(data.history).forEach(item => {
                const myMove = playerRole === 'host' ? item.host : item.guest;
                if(myMove && myMove.guess) myUsedCities.add(myMove.guess);
            });
        }

        // --- STATE HANDLING ---
        if (data.roundState === 'results') {
             // Reset de flag zodat we volgende ronde weer kunnen rekenen
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
             // State = 'guessing'
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

        // Host Calculation - ALLEEN als we nog niet bezig zijn
        if (playerRole === 'host' && data.roundState === 'guessing' && !isProcessingTurn) {
            if (data.host?.temp !== undefined && data.guest?.temp !== undefined) {
                isProcessingTurn = true; // Blokkeer dubbele berekening
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

    // FIX: Gebruik een specifieke key 'round_X' ipv push()
    // Dit voorkomt dat dezelfde ronde 100x in de lijst komt
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

    // Alles in één update sturen
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

    // Check of data compleet is voor we rekenen
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
    } else {
        title.textContent = "💀 GAME OVER";
        title.className = "text-4xl font-black text-center mb-6 text-red-600";
    }

    onValue(ref(db, `rooms/${currentRoomId}/history`), (snapshot) => {
        const history = snapshot.val();
        if (!history) return;

        const list = document.getElementById('summary-list');
        list.innerHTML = '';

        // Sorteer de rondes netjes op volgorde (round_1, round_2...)
        const sortedHistory = Object.values(history).sort((a, b) => a.round - b.round);

        sortedHistory.forEach(item => {
            const myMove = playerRole === 'host' ? item.host : item.guest;
            const oppMove = playerRole === 'host' ? item.guest : item.host;

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
    }, { onlyOnce: true });
}