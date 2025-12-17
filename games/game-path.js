import { API_KEY, FORECAST_API_URL } from '../config.js';
import { getFlagEmoji, showFloatingText, triggerWinConfetti, shakeElement } from '../utils.js';
import { WORLD_GRAPH, ISO_MAP } from '../data/world-data.js';
import { db, ref, set, onValue, update } from '../firebase.js';

// --- GLOBALE VARIABELEN ---
let map;
let geoJsonLayer;
let currentCode = null;
let startCode = null;
let endCode = null;
let targetScore = 0;
let currentScore = 0;
let visitedList = [];
let generatedPath = [];
let isProcessing = false;
let isLevelReady = false; 
let targetSteps = 0;
let currentSteps = 0;

// MULTIPLAYER STATE
let isMultiplayer = false;
let roomId = null;
let playerRole = null; // 'host' of 'client'
let p1Wins = 0;
let p2Wins = 0;
let currentRound = 0; 
const MAX_WINS = 3; 

// Resultaten visualisatie
let p1LastPath = [];
let p2LastPath = [];
let isShowingResultMap = false;
let highlightMode = null; // 'p1', 'p2' of null (voor hover effect)

const tempCache = {};

// --- INITIALISATIE ---
export async function init(mode) {
    console.log(`🗺️ Path Game Init: ${mode}`);
    isMultiplayer = (mode === 'online');
    
    // CSS Fix voor Leaflet focus outlines
    if (!document.getElementById('leaflet-fix-style')) {
        const style = document.createElement('style');
        style.id = 'leaflet-fix-style';
        style.textContent = `path.leaflet-interactive:focus { outline: none; } .leaflet-container path:focus { outline: none !important; } g:focus { outline: none; }`;
        document.head.appendChild(style);
    }
    
    // UI Reset
    document.getElementById('path-lobby').classList.add('hidden');
    document.getElementById('path-loading').classList.add('hidden');
    document.getElementById('path-ui').classList.add('hidden');
    document.getElementById('path-end-screen').classList.add('hidden');
    document.getElementById('path-mp-scoreboard').classList.add('hidden');
    
    // Map Reset
    if (map) { 
        map.off(); 
        map.remove(); 
        map = null; 
    }
    
    map = L.map('path-map', {
        minZoom: 2, maxZoom: 6, zoomControl: false, dragging: true,
        doubleClickZoom: false, attributionControl: false, worldCopyJump: true
    }).setView([30, 0], 2);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { 
        attribution: '©OpenStreetMap', subdomains: 'abcd', maxZoom: 19
    }).addTo(map);
    
    await loadGeoJSON();

    if (isMultiplayer) {
        setupMultiplayerLobby();
    } else {
        startSoloGame();
    }
}

async function loadGeoJSON() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
        const data = await response.json();
        geoJsonLayer = L.geoJSON(data, { 
            style: styleFeature, 
            onEachFeature: onEachFeature 
        }).addTo(map);
    } catch (e) { console.error("Fout bij laden kaart:", e); }
}

// =============================================================================
// MULTIPLAYER LOGICA
// =============================================================================

function setupMultiplayerLobby() {
    document.getElementById('path-lobby').classList.remove('hidden');
    
    const createBtn = document.getElementById('path-create-room-btn');
    const joinBtn = document.getElementById('path-join-room-btn');
    
    // Verwijder oude listeners
    const newCreate = createBtn.cloneNode(true);
    const newJoin = joinBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newCreate, createBtn);
    joinBtn.parentNode.replaceChild(newJoin, joinBtn);

    newCreate.onclick = createPathRoom;
    newJoin.onclick = joinPathRoom;
    newCreate.disabled = false;
    
    p1Wins = 0; p2Wins = 0; currentRound = 0;
    document.getElementById('path-lobby-status').innerText = "Best of 5 - Eerst 3 rondes wint!";
}

function createPathRoom() {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    playerRole = 'host';
    
    const gameRef = ref(db, `path_games/${roomId}`);
    set(gameRef, {
        status: 'waiting',
        p1: { score: 0, steps: 0, done: false, ready: false, path: [] },
        p2: { score: 0, steps: 0, done: false, ready: false, path: [] },
        p1_wins: 0, p2_wins: 0, round: 0, puzzle: null
    });

    document.getElementById('path-lobby-status').innerHTML = `Kamer Code: <span class="text-2xl font-black text-pink-600 select-all">${roomId}</span><br>Wachten op speler...`;
    document.getElementById('path-create-room-btn').disabled = true;

    onValue(gameRef, (snapshot) => { 
        const data = snapshot.val(); 
        if (data) handleGameUpdate(data); 
    });
}

function joinPathRoom() {
    const input = document.getElementById('path-room-code-input').value.toUpperCase().trim();
    if (input.length < 3) return;
    
    roomId = input;
    playerRole = 'client';
    
    const gameRef = ref(db, `path_games/${roomId}`);
    update(gameRef, { p2_joined: true });
    
    document.getElementById('path-lobby-status').innerText = "Verbonden! Wachten op host...";
    
    onValue(gameRef, (snapshot) => { 
        const data = snapshot.val(); 
        if (data) handleGameUpdate(data); 
    });
}

function handleGameUpdate(data) {
    if (playerRole === 'host' && data.p2_joined && data.status === 'waiting') {
        startNewMultiplayerRound(data);
    }

    if (data.status === 'playing') {
        if (data.round > currentRound) {
            currentRound = data.round;
            p1Wins = data.p1_wins;
            p2Wins = data.p2_wins;
            document.getElementById('path-p1-wins').innerText = p1Wins;
            document.getElementById('path-p2-wins').innerText = p2Wins;
            startGameRound(data.puzzle);
        }
        if (playerRole === 'host' && data.p1.done && data.p2.done) {
            setTimeout(() => evaluateRoundWinner(data), 500);
        }
    }

    if (data.status === 'round_over') {
        if (!isShowingResultMap) {
            showRoundResult(data);
        }
        if (playerRole === 'host' && data.p1.ready && data.p2.ready) {
            startNewMultiplayerRound(data);
        }
    }
}

async function startNewMultiplayerRound(prevData) {
    const gameRef = ref(db, `path_games/${roomId}`);
    update(gameRef, { status: 'generating' });

    await generateLevelLogic(); 
    
    const puzzleData = { startCode, endCode, targetScore, targetSteps, generatedPath };
    const nextRound = (prevData.round || 0) + 1;

    update(gameRef, {
        puzzle: puzzleData, 
        status: 'playing',
        round: nextRound,
        p1: { done: false, ready: false, diff: 0, steps: 0, status: '', path: [], score: 0 },
        p2: { done: false, ready: false, diff: 0, steps: 0, status: '', path: [], score: 0 }
    });
}

function evaluateRoundWinner(data) {
    let winner = null;
    const p1Diff = data.p1.diff;
    const p2Diff = data.p2.diff;

    if (p1Diff < p2Diff) winner = 'p1';
    else if (p2Diff < p1Diff) winner = 'p2';
    else {
        if (data.p1.steps < data.p2.steps) winner = 'p1';
        else if (data.p2.steps < data.p1.steps) winner = 'p2';
        else winner = 'draw';
    }

    let newP1Wins = data.p1_wins || 0;
    let newP2Wins = data.p2_wins || 0;
    
    if (winner === 'p1') newP1Wins++;
    if (winner === 'p2') newP2Wins++;

    update(ref(db, `path_games/${roomId}`), {
        status: 'round_over', 
        last_winner: winner, 
        p1_wins: newP1Wins, 
        p2_wins: newP2Wins
    });
}

// =============================================================================
// GAME LOGICA
// =============================================================================

async function startSoloGame() {
    resetGameState();
    document.getElementById('path-loading').classList.remove('hidden');
    document.getElementById('path-loading-text').innerText = "Route berekenen...";
    await generateLevelLogic();
    showGameUI();
}

function startGameRound(puzzleData) {
    resetGameState();
    startCode = puzzleData.startCode;
    endCode = puzzleData.endCode;
    targetScore = puzzleData.targetScore;
    targetSteps = puzzleData.targetSteps;
    generatedPath = puzzleData.generatedPath;
    
    document.getElementById('path-lobby').classList.add('hidden');
    showGameUI();
}

function resetGameState() {
    currentScore = 0; currentSteps = 0;
    visitedList = []; currentCode = null;
    isLevelReady = false; isProcessing = false;
    isShowingResultMap = false; highlightMode = null;
    p1LastPath = []; p2LastPath = [];
    
    document.getElementById('path-mp-status').innerText = "";
    document.getElementById('path-end-screen').classList.add('hidden');
    document.getElementById('path-ui').classList.remove('hidden'); 
    
    document.getElementById('path-next-round-btn').classList.add('hidden');
    const nextBtn = document.getElementById('path-next-round-btn');
    nextBtn.disabled = false;
    nextBtn.innerText = "Volgende Ronde ➡️";
}

async function generateLevelLogic() {
    const countries = Object.keys(WORLD_GRAPH);
    startCode = countries[Math.floor(Math.random() * countries.length)];
    let attempts = 0;
    
    do {
        endCode = countries[Math.floor(Math.random() * countries.length)];
        attempts++;
    } while ((startCode === endCode || WORLD_GRAPH[startCode].neighbors.includes(endCode)) && attempts < 100);

    let path = await findRandomPath(startCode, endCode);
    if (!path) return generateLevelLogic(); 
    
    generatedPath = path;
    targetSteps = path.length - 1;
    
    let sum = 0;
    for (let i = 1; i < path.length - 1; i++) {
        const code = path[i];
        const temp = await getCapitalTemp(code);
        if (temp !== null) sum += temp;
        if (!isMultiplayer) await new Promise(r => setTimeout(r, 50));
    }
    targetScore = sum;
}

function showGameUI() {
    currentCode = startCode;
    document.getElementById('start-country-display').innerHTML = `${getFlagEmoji(startCode)} ${WORLD_GRAPH[startCode].name}`;
    document.getElementById('end-country-display').innerHTML = `${getFlagEmoji(endCode)} ${WORLD_GRAPH[endCode].name}`;
    
    const mpScore = document.getElementById('path-mp-scoreboard');
    const restartBtn = document.getElementById('path-restart-btn');
    const mpControls = document.getElementById('path-mp-controls');

    if (isMultiplayer) {
        mpScore.classList.remove('hidden');
        mpControls.classList.remove('hidden');
        restartBtn.classList.add('hidden'); 
    } else {
        mpScore.classList.add('hidden');
        mpControls.classList.add('hidden');
        restartBtn.classList.add('hidden'); 
    }

    updateUI();
    document.getElementById('path-loading').classList.add('hidden');
    document.getElementById('path-ui').classList.remove('hidden');
    
    if (map) {
        setTimeout(() => {
            map.invalidateSize();
            if(geoJsonLayer) {
                let targetLayer = null;
                geoJsonLayer.eachLayer((layer) => {
                    if (ISO_MAP[layer.feature.id] === startCode) targetLayer = layer;
                });
                if (targetLayer) {
                    const bounds = targetLayer.getBounds();
                    map.fitBounds(bounds, { padding: [200, 200], maxZoom: 4, animate: false });
                } else {
                    map.setView([30, 10], 2);
                }
            }
        }, 100);
    }
    isLevelReady = true; 
    if(geoJsonLayer) geoJsonLayer.setStyle(styleFeature);
}

// --- INTERACTIE ---

async function handleCountryClick(clickedCode) {
    if (isProcessing || isShowingResultMap) return; 
    if (!WORLD_GRAPH[clickedCode]) return;
    if (clickedCode === currentCode) return; 
    
    const currentData = WORLD_GRAPH[currentCode];
    if (!currentData.neighbors.includes(clickedCode)) { shakeElement('path-info-panel'); return; }
    if (visitedList.includes(clickedCode) && clickedCode !== startCode) { shakeElement('path-info-panel'); return; }
    if (currentSteps >= targetSteps && clickedCode !== endCode) { shakeElement('path-info-panel'); return; }

    if (clickedCode === endCode) {
        visitedList.push(currentCode);
        visitedList.push(clickedCode); 
        currentCode = clickedCode;
        updateUI();
        geoJsonLayer.setStyle(styleFeature);
        handleFinish('win'); 
        return;
    }

    if (currentSteps >= targetSteps) {
        visitedList.push(currentCode);
        currentCode = clickedCode; 
        updateUI();
        geoJsonLayer.setStyle(styleFeature);
        handleFinish('steps_out'); 
        return;
    }

    isProcessing = true;
    showLoadingSpinner(true);
    const temp = await getCapitalTemp(clickedCode);
    
    if (temp !== null) {
        visitedList.push(currentCode); 
        currentCode = clickedCode;     
        currentScore += temp;
        currentSteps++;
        showFloatingText(document.getElementById('score-box-current'), `${temp > 0 ? '+' : ''}${temp}°C`, 'heal');

        if (currentSteps >= targetSteps) {
            const neighbors = WORLD_GRAPH[clickedCode].neighbors;
            if (!neighbors.includes(endCode)) handleFinish('steps_out');
            else { updateUI(); geoJsonLayer.setStyle(styleFeature); }
        } else {
            updateUI();
            geoJsonLayer.setStyle(styleFeature); 
        }
    } else {
        alert("Kon weerdata niet ophalen.");
    }
    showLoadingSpinner(false);
    isProcessing = false;
}

function handleFinish(status) {
    if (isMultiplayer) {
        const myKey = playerRole === 'host' ? 'p1' : 'p2';
        const myDiff = Math.abs(targetScore - currentScore);
        
        const myResult = {
            done: true, 
            status: status, 
            diff: status === 'steps_out' ? 9999 : myDiff, 
            steps: currentSteps, 
            score: currentScore,
            path: visitedList 
        };
        update(ref(db, `path_games/${roomId}/${myKey}`), myResult);

        document.getElementById('path-ui').classList.add('hidden');
        document.getElementById('path-end-screen').classList.remove('hidden');
        document.getElementById('path-end-title').innerText = "Klaar!";
        document.getElementById('path-end-title').className = "text-5xl font-black mb-2 text-slate-800";
        document.getElementById('path-end-message').innerText = "Wachten op tegenstander...";
        document.getElementById('path-mp-status').innerText = "⏳ Wachten op uitslag..."; 
        document.getElementById('path-summary-text').innerHTML = ""; 
    } else {
        finishSoloGame(status);
    }
}

function finishSoloGame(status) {
    document.getElementById('path-ui').classList.add('hidden');
    const endScreen = document.getElementById('path-end-screen');
    endScreen.classList.remove('hidden');
    
    renderResultText(status, targetScore, currentScore);
    
    const summary = document.getElementById('path-summary-text');
    let pathNames = generatedPath.map(c => WORLD_GRAPH[c].name).join(" ➡️ ");
    summary.innerHTML = `<strong class="block mb-2 text-slate-700">Computer route:</strong>${pathNames}`;

    document.getElementById('path-mp-controls').classList.add('hidden');
    const restartBtn = document.getElementById('path-restart-btn');
    restartBtn.classList.remove('hidden');
    restartBtn.innerText = "Opnieuw Spelen 🔄";
    restartBtn.onclick = () => init('solo'); 
}

function showRoundResult(data) {
    p1Wins = data.p1_wins; p2Wins = data.p2_wins;
    isShowingResultMap = true; 
    p1LastPath = data.p1.path || []; p2LastPath = data.p2.path || []; 

    const myKey = playerRole === 'host' ? 'p1' : 'p2';
    const oppKey = playerRole === 'host' ? 'p2' : 'p1';
    const myData = data[myKey]; const oppData = data[oppKey]; const winner = data.last_winner;

    const title = document.getElementById('path-end-title');
    const msg = document.getElementById('path-end-message');
    const mpStatus = document.getElementById('path-mp-status');
    const nextBtn = document.getElementById('path-next-round-btn');

    mpStatus.innerText = ""; 

    if (winner === myKey) {
        title.innerText = "🎉 Ronde Gewonnen!"; title.className = "text-5xl font-black mb-2 text-green-500"; triggerWinConfetti();
    } else if (winner === oppKey) {
        title.innerText = "😢 Ronde Verloren"; title.className = "text-5xl font-black mb-2 text-red-500";
    } else {
        title.innerText = "🤝 Gelijkspel"; title.className = "text-5xl font-black mb-2 text-orange-500";
    }

    const myScoreText = myData.status === 'steps_out' ? 'Af' : `${myData.diff}°C ernaast`;
    const oppScoreText = oppData.status === 'steps_out' ? 'Af' : `${oppData.diff}°C ernaast`;

    msg.innerHTML = `
        <div class="grid grid-cols-2 gap-4 mt-4">
            <div id="path-res-me" class="p-4 bg-blue-50 rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-100 transition transform hover:scale-105">
                <div class="font-bold text-blue-800">JIJ (Hover)</div>
                <div class="text-xl font-black">${myScoreText}</div>
                <div class="text-xs text-slate-500">Score: ${myData.score}</div>
            </div>
            <div id="path-res-opp" class="p-4 bg-red-50 rounded-xl border border-red-100 cursor-pointer hover:bg-red-100 transition transform hover:scale-105">
                <div class="font-bold text-red-800">TEGENSTANDER (Hover)</div>
                <div class="text-xl font-black">${oppScoreText}</div>
                <div class="text-xs text-slate-500">Score: ${oppData.score}</div>
            </div>
        </div>
        <div class="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest text-center pt-2">
            <span class="inline-block w-3 h-3 bg-blue-500 rounded-full mr-1"></span>Jij 
            <span class="inline-block w-3 h-3 bg-red-500 rounded-full ml-2 mr-1"></span>Zij 
            <span class="inline-block w-3 h-3 bg-purple-500 rounded-full ml-2 mr-1"></span>Samen
        </div>
        <div class="mt-4 font-black text-2xl text-slate-700 bg-white inline-block px-4 py-1 rounded shadow-sm">
            STAND: ${p1Wins} - ${p2Wins}
        </div>
    `;

    document.getElementById('path-mp-controls').classList.remove('hidden');
    document.getElementById('path-ui').classList.remove('hidden'); 
    document.getElementById('path-end-screen').classList.remove('hidden'); 
    
    // SETUP HOVER LISTENERS VOOR RESULTATEN
    const myBox = document.getElementById('path-res-me');
    const oppBox = document.getElementById('path-res-opp');

    if (myBox) {
        myBox.onmouseenter = () => { highlightMode = myKey; geoJsonLayer.setStyle(styleFeature); };
        myBox.onmouseleave = () => { highlightMode = null; geoJsonLayer.setStyle(styleFeature); };
    }
    if (oppBox) {
        oppBox.onmouseenter = () => { highlightMode = oppKey; geoJsonLayer.setStyle(styleFeature); };
        oppBox.onmouseleave = () => { highlightMode = null; geoJsonLayer.setStyle(styleFeature); };
    }

    if (map) { map.invalidateSize(); map.setView([30, 10], 2); }
    geoJsonLayer.setStyle(styleFeature);

    if (p1Wins >= MAX_WINS || p2Wins >= MAX_WINS) {
        const iWon = (myKey === 'p1' && p1Wins >= 3) || (myKey === 'p2' && p2Wins >= 3);
        mpStatus.innerText = iWon ? "🏆 GEFELICITEERD! JE HEBT GEWONNEN!" : "💀 HELAAS, JE HEBT VERLOREN.";
        mpStatus.className = iWon ? "text-xl font-black text-yellow-600 mt-4" : "text-xl font-black text-slate-600 mt-4";
        nextBtn.classList.add('hidden');
        const restartBtn = document.getElementById('path-restart-btn');
        restartBtn.classList.remove('hidden');
        restartBtn.innerText = "Terug naar Menu";
        restartBtn.onclick = () => location.reload();
    } else {
        nextBtn.classList.remove('hidden');
        nextBtn.disabled = false;
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.onclick = () => {
            newNextBtn.disabled = true;
            newNextBtn.innerText = "Wachten op de ander...";
            const myReadyKey = playerRole === 'host' ? 'p1' : 'p2';
            update(ref(db, `path_games/${roomId}/${myReadyKey}`), { ready: true });
        };
    }
}

function renderResultText(status, target, current) {
    const title = document.getElementById('path-end-title');
    const msg = document.getElementById('path-end-message');
    const diff = Math.abs(target - current);
    
    if (status === 'steps_out') {
        title.innerText = "🛑 Stappen Op!"; 
        title.className = "text-5xl font-black mb-2 text-red-500"; 
        msg.innerText = "Je hebt het eindpunt niet bereikt.";
    } else if (status === 'win') {
        if (diff === 0) { 
            title.innerText = "🏆 PERFECT!"; title.className = "text-5xl font-black mb-2 text-yellow-500"; 
            msg.innerText = `Exact ${targetSteps} stappen & ${target}°C!`; triggerWinConfetti(); 
        } else if (diff <= 15) { 
            title.innerText = "👏 Goed!"; title.className = "text-5xl font-black mb-2 text-green-600"; 
            msg.innerText = `Verschil: ${diff}°C`; triggerWinConfetti(); 
        } else { 
            title.innerText = "🥶 Helaas..."; title.className = "text-5xl font-black mb-2 text-slate-600"; 
            msg.innerText = `Te groot verschil: ${diff}°C`; 
        }
    }
}

// --- KAART STYLING (AANGEPAST VOOR HIGHLIGHT) ---
function styleFeature(feature) {
    const geoId = feature.id; 
    const gameCode = ISO_MAP[geoId]; 
    let style = { fillColor: '#f1f5f9', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.3 };
    if (!gameCode || !WORLD_GRAPH[gameCode]) return style; 
    
    // Resultaat weergave
    if (isShowingResultMap) {
        style.fillOpacity = 0.7; style.cursor = 'default'; style.fillColor = '#cbd5e1'; 
        
        let p1Here = p1LastPath.includes(gameCode); 
        let p2Here = p2LastPath.includes(gameCode);
        
        // HOVER LOGICA: Als highlightMode 'p1' is, toon p2 niet.
        if (highlightMode === 'p1') p2Here = false;
        if (highlightMode === 'p2') p1Here = false;

        if (p1Here && p2Here) { style.fillColor = '#a855f7'; style.weight = 2; style.color = '#7e22ce'; } 
        else if (p1Here) { style.fillColor = '#3b82f6'; style.weight = 2; style.color = '#1d4ed8'; } 
        else if (p2Here) { style.fillColor = '#ef4444'; style.weight = 2; style.color = '#b91c1c'; }
        
        if (gameCode === startCode) { style.weight = 4; style.color = '#22c55e'; } 
        if (gameCode === endCode) { style.weight = 4; style.color = '#fbbf24'; } 
        return style;
    }

    if (!isLevelReady) { style.fillColor = '#cbd5e1'; style.fillOpacity = 0.7; return style; }
    
    style.fillColor = '#cbd5e1'; style.fillOpacity = 0.7; style.cursor = 'pointer';
    const stepsUsedUp = currentSteps >= targetSteps;
    let isNeighbor = currentCode && WORLD_GRAPH[currentCode].neighbors.includes(gameCode) && !visitedList.includes(gameCode);
    if (stepsUsedUp && gameCode !== endCode) isNeighbor = false; 
    
    const isStart = gameCode === startCode; const isEnd = gameCode === endCode; 
    const isCurrent = gameCode === currentCode; const isVisited = visitedList.includes(gameCode);
    
    if (isNeighbor) { style.fillColor = '#d1fae5'; style.color = '#fbbf24'; style.weight = 3; }
    if (isVisited) { style.fillColor = '#64748b'; style.color = 'white'; style.weight = 1; }
    if (isStart) { style.fillColor = '#3b82f6'; style.fillOpacity = 0.9; }
    if (isEnd) { style.fillColor = '#ef4444'; style.fillOpacity = 0.9; if (isNeighbor) { style.color = '#fbbf24'; style.weight = 4; } }
    if (isCurrent) { style.fillColor = '#fbbf24'; style.weight = 2; style.color = '#f59e0b'; style.fillOpacity = 1.0; }
    if (stepsUsedUp && !isNeighbor && !isStart && !isEnd && !isCurrent && !isVisited) { style.fillOpacity = 0.3; }
    return style;
}

function onEachFeature(feature, layer) {
    const gameCode = ISO_MAP[feature.id];
    if (gameCode && WORLD_GRAPH[gameCode]) {
        layer.bindTooltip(`${getFlagEmoji(gameCode)} ${WORLD_GRAPH[gameCode].name}`, { direction: 'top', sticky: true, offset: [0, -10], opacity: 0.9, className: 'font-bold text-sm bg-white border border-slate-200 px-2 py-1 rounded shadow-sm' });
    }
    layer.on({
        click: (e) => { if (isLevelReady && gameCode) handleCountryClick(gameCode); },
        mouseover: (e) => { if (isLevelReady && gameCode && WORLD_GRAPH[gameCode]) e.target.setStyle({ fillOpacity: 0.9 }); },
        mouseout: (e) => { if (isLevelReady) geoJsonLayer.resetStyle(e.target); }
    });
}

// --- HELPER FUNCTIES ---
async function findRandomPath(start, end) {
    let current = start; let path = [start]; let steps = 0;
    const maxSteps = 9; const minSteps = 4;
    while (current !== end && steps < maxSteps) {
        if (!WORLD_GRAPH[current]) return null;
        const neighbors = WORLD_GRAPH[current].neighbors;
        const validNeighbors = neighbors.filter(n => !path.includes(n) && WORLD_GRAPH[n]);
        if (validNeighbors.length === 0) return null;
        const next = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
        path.push(next); current = next; steps++;
    }
    if (current === end && steps >= minSteps) return path;
    return null;
}

async function getCapitalTemp(countryCode) {
    if (tempCache[countryCode]) return tempCache[countryCode];
    const city = WORLD_GRAPH[countryCode].capital;
    const url = `${FORECAST_API_URL}?q=${city},${countryCode}&appid=${API_KEY}&units=metric`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (res.status !== 200) throw new Error("API Error");
        const todayDate = data.list[0].dt_txt.slice(0, 10);
        let maxTemp = -1000; let found = false;
        for (const item of data.list) {
            if (item.dt_txt.startsWith(todayDate)) {
                if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
                found = true;
            }
        }
        if (!found) return null;
        const result = Math.round(maxTemp);
        tempCache[countryCode] = result;
        return result;
    } catch (e) { return null; }
}

function updateUI() {
    const targetEl = document.getElementById('path-target-display');
    targetEl.innerHTML = `${targetScore}°C <span class="block text-xs text-yellow-300 opacity-80 font-normal">Max ${targetSteps} stappen</span>`;
    const currentEl = document.getElementById('path-score-display');
    currentEl.innerHTML = `${currentScore}°C <span class="block text-xs text-slate-400 font-normal">Gebruikt: ${currentSteps}</span>`;
    const diffEl = document.getElementById('path-diff-display');
    const remaining = targetSteps - currentSteps;
    if (remaining > 0) {
        diffEl.innerText = `${remaining} over`; diffEl.className = "text-[10px] font-bold text-blue-500 absolute bottom-1 left-0 w-full";
    } else {
        diffEl.innerText = `Op!`; diffEl.className = "text-[10px] font-bold text-red-500 absolute bottom-1 left-0 w-full";
    }
}

function showLoadingSpinner(show) {
    const el = document.getElementById('path-spinner');
    if(show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}