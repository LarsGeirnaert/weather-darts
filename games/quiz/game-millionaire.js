import { API_KEY, FORECAST_API_URL } from '../../config.js';
import { getFlagEmoji, triggerWinConfetti, showFloatingText } from '../../utils.js';
import { CITIES_POOL } from '../../data/cities-data.js';

const MONEY_LADDER = [
    50, 100, 200, 300, 500, 
    1000, 2000, 4000, 8000, 16000, 
    32000, 64000, 125000, 250000, 500000, 1000000
];

const QUESTION_TYPES = ['HOT', 'COLD', 'CLOSE', 'FAR'];

// State
let currentRound = 0;
let currentMoney = 0;
let correctAnswerIndex = -1;
let currentOptions = []; 
let currentQuestion = {}; 
let lifelines = { fifty: true, doubleDip: true, stats: true }; 
let isProcessing = false;
let isDoubleDipActive = false;

const tempCache = {};

export function init() {
    console.log("💎 Millionaire Init");
    
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = () => handleAnswer(i);
    }

    document.getElementById('lifeline-5050').onclick = useFiftyFifty;
    document.getElementById('lifeline-doubledip').onclick = useDoubleDip;
    document.getElementById('lifeline-stats').onclick = useClimateStats; 
    
    const stopBtn = document.getElementById('mil-stop-btn');
    if(stopBtn) stopBtn.onclick = cashOut;

    const restartBtn = document.getElementById('mil-restart-btn');
    if(restartBtn) restartBtn.onclick = init; 

    resetGame();
    loadQuestion();
}

function resetGame() {
    currentRound = 0;
    currentMoney = 0;
    lifelines = { fifty: true, doubleDip: true, stats: true };
    isProcessing = false;
    isDoubleDipActive = false;
    
    document.getElementById('mil-end-screen').classList.add('hidden');
    document.getElementById('mil-game-area').classList.remove('hidden');
    
    updateUI();
    updateLifelineButtons();
}

function cashOut() {
    if (isProcessing) return;
    finishGame('walk');
}

async function loadQuestion() {
    if (isProcessing) return;
    isProcessing = true;
    isDoubleDipActive = false; 
    
    document.getElementById('mil-loading').classList.remove('hidden');
    document.getElementById('mil-game-area').classList.add('hidden');

    try {
        const roundOptions = [];
        const usedIndices = new Set();
        let attempts = 0;
        
        while (roundOptions.length < 4 && attempts < 100) {
            const idx = Math.floor(Math.random() * CITIES_POOL.length);
            if (!usedIndices.has(idx)) {
                usedIndices.add(idx);
                roundOptions.push(CITIES_POOL[idx]);
            }
            attempts++;
        }

        const weatherPromises = roundOptions.map(city => getWeatherData(city));
        const weatherData = await Promise.all(weatherPromises);

        currentOptions = roundOptions.map((city, index) => ({
            ...city,
            temp: weatherData[index].temp,
            avg: weatherData[index].avg
        }));

        determineWinnerAndQuestion();
        renderQuestion();

    } catch (e) {
        console.error("Fout bij laden vraag:", e);
        isProcessing = false;
        setTimeout(loadQuestion, 1000);
    }

    isProcessing = false;
}

function determineWinnerAndQuestion() {
    const type = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    let target = 0;
    
    if (type === 'CLOSE' || type === 'FAR') {
        target = Math.floor(Math.random() * 40) - 5; 
    }

    currentQuestion = { type, target };
    correctAnswerIndex = -1;

    let bestVal = (type === 'COLD' || type === 'CLOSE') ? 9999 : -9999;

    currentOptions.forEach((opt, index) => {
        let valToCheck = 0;
        if (type === 'HOT') valToCheck = opt.temp;
        else if (type === 'COLD') valToCheck = opt.temp;
        else if (type === 'CLOSE') valToCheck = Math.abs(opt.temp - target);
        else if (type === 'FAR') valToCheck = Math.abs(opt.temp - target);

        const isBetter = (type === 'HOT' || type === 'FAR') ? (valToCheck > bestVal) : (valToCheck < bestVal);
        
        if (isBetter) {
            bestVal = valToCheck;
            correctAnswerIndex = index;
        }
    });
}

function renderQuestion() {
    document.getElementById('mil-loading').classList.add('hidden');
    document.getElementById('mil-game-area').classList.remove('hidden');

    const qText = document.getElementById('mil-question-text');
    const { type, target } = currentQuestion;

    if (type === 'HOT') qText.innerText = "Welke stad is het WARMST? 🔥";
    else if (type === 'COLD') qText.innerText = "Welke stad is het KOUDST? ❄️";
    else if (type === 'CLOSE') qText.innerText = `Welke stad zit het DICHTST bij ${target}°C? 🎯`;
    else if (type === 'FAR') qText.innerText = `Welke stad zit het VERST van ${target}°C? ↔️`;

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        btn.className = 'mil-option'; 
        btn.disabled = false;
        btn.style.opacity = "1";
        
        const opt = currentOptions[i];
        const flag = getFlagEmoji(opt.country);
        const letter = ['A', 'B', 'C', 'D'][i];
        
        btn.innerHTML = `<span class="opt-letter">${letter}:</span> <span class="opt-text">${flag} ${opt.name}</span>`;
    }
    
    updateLifelineButtons();
}

async function handleAnswer(index) {
    if (isProcessing) return;
    const btn = document.getElementById(`opt-${index}`);
    if (btn.disabled) return; 

    if (!isDoubleDipActive) {
        isProcessing = true;
    }
    
    btn.classList.add('mil-selected'); 

    await new Promise(r => setTimeout(r, 1500));

    if (index === correctAnswerIndex) {
        // --- GOED ---
        btn.classList.remove('mil-selected');
        btn.classList.add('mil-correct'); 
        isDoubleDipActive = false; 
        
        revealTemps();

        currentMoney = MONEY_LADDER[currentRound];
        currentRound++;
        updateUI();

        if (currentRound >= MONEY_LADDER.length) {
            finishGame('win');
        } else {
            setTimeout(() => {
                isProcessing = false; 
                loadQuestion();
            }, 3000);
        }
    } else {
        // --- FOUT ---
        btn.classList.remove('mil-selected');
        btn.classList.add('mil-wrong'); 
        
        if (isDoubleDipActive) {
            isDoubleDipActive = false; 
            btn.disabled = true; 
            updateLifelineButtons(); 
            showFloatingText(btn, "Nog 1 Kans!", "text-yellow-400");
        } else {
            const correctBtn = document.getElementById(`opt-${correctAnswerIndex}`);
            correctBtn.classList.add('mil-correct');
            
            revealTemps(); 

            setTimeout(() => {
                finishGame('lose');
            }, 3000);
        }
    }
}

function revealTemps() {
    currentOptions.forEach((opt, i) => {
        const b = document.getElementById(`opt-${i}`);
        if (!b.innerHTML.includes('°C')) {
            const tempSpan = b.querySelector('.opt-text');
            // AANGEPAST: Geen 'Gem' meer, alleen de temperatuur tussen haakjes
            tempSpan.innerHTML += ` <span class="text-xs opacity-80 font-normal ml-2">(${opt.temp}°C)</span>`;
        }
    });
}

function finishGame(result) {
    document.getElementById('mil-game-area').classList.add('hidden');
    const endScreen = document.getElementById('mil-end-screen');
    endScreen.classList.remove('hidden');
    
    const title = document.getElementById('mil-end-title');
    const msg = document.getElementById('mil-end-msg');
    const moneyDisplay = document.getElementById('mil-end-money');

    let finalPrize = 0;

    if (result === 'walk') {
        finalPrize = currentMoney;
        title.innerText = "Slim Gespeeld! 💼";
        title.className = "text-5xl font-black mb-4 text-blue-600";
        msg.innerText = "Je bent gestopt en neemt mee:";
    } 
    else if (result === 'win') {
        finalPrize = 1000000;
        title.innerText = "MILJONAIR! 💎";
        title.className = "text-5xl font-black mb-4 text-yellow-500 animate-bounce";
        msg.innerText = "Ongelooflijk! Je wint de hoofdprijs:";
        triggerWinConfetti(); 
    } 
    else { 
        if (currentMoney >= 32000) finalPrize = 32000;
        else if (currentMoney >= 1000) finalPrize = 1000;
        else finalPrize = 0;

        title.innerText = "Game Over 🥀";
        title.className = "text-5xl font-black mb-4 text-slate-700";
        msg.innerText = "Helaas fout. Je valt terug naar:";
    }
    
    moneyDisplay.innerText = finalPrize.toLocaleString();
    isProcessing = false;
}

// --- LIFELINES ---

function useFiftyFifty() {
    if (!lifelines.fifty || isProcessing || isDoubleDipActive) return;
    lifelines.fifty = false;
    updateLifelineButtons();

    const buttons = [];
    for(let i=0; i<4; i++) {
        if(i !== correctAnswerIndex) buttons.push(i);
    }
    buttons.sort(() => Math.random() - 0.5);
    
    for(let i=0; i<2; i++) {
        const idx = buttons[i];
        const btn = document.getElementById(`opt-${idx}`);
        btn.style.opacity = "0";
        btn.disabled = true;
    }
}

function useDoubleDip() {
    if (!lifelines.doubleDip || isProcessing) return;
    lifelines.doubleDip = false;
    isDoubleDipActive = true; 
    updateLifelineButtons();
    const btn = document.getElementById('lifeline-doubledip');
    showFloatingText(btn, "Actief!", "heal");
}

function useClimateStats() {
    if (!lifelines.stats || isProcessing) return;
    lifelines.stats = false;
    updateLifelineButtons();

    // Toon het weekgemiddelde
    for(let i=0; i<4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        const avgTemp = currentOptions[i].avg;
        
        const badge = document.createElement('span');
        badge.className = "ml-auto text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded border border-blue-700 shadow-sm ml-2";
        badge.innerHTML = `Week: ~${avgTemp}°C`;
        
        btn.querySelector('.opt-text').appendChild(badge);
    }
    
    const lifelineBtn = document.getElementById('lifeline-stats');
    showFloatingText(lifelineBtn, "Stats!", "heal");
}

// --- API & UI ---

async function getWeatherData(cityObj) {
    const cacheKey = `${cityObj.name}-${cityObj.country}`;
    if (tempCache[cacheKey]) return tempCache[cacheKey];

    const url = `${FORECAST_API_URL}?q=${cityObj.name},${cityObj.country}&appid=${API_KEY}&units=metric`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        const todayDate = data.list[0].dt_txt.slice(0, 10);
        let maxTemp = -1000;
        let totalTemp = 0;
        let count = 0;

        for (const item of data.list) {
            if (item.dt_txt.startsWith(todayDate)) {
                if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
            }
            totalTemp += item.main.temp;
            count++;
        }
        
        const result = { 
            temp: Math.round(maxTemp), 
            avg: Math.round(totalTemp / count) 
        };
        
        tempCache[cacheKey] = result;
        return result;

    } catch (e) {
        return { temp: 0, avg: 0 }; 
    }
}

function updateUI() {
    document.getElementById('mil-round').innerText = currentRound + 1;
    document.getElementById('mil-money').innerText = currentMoney.toLocaleString();
}

function updateLifelineButtons() {
    const btn50 = document.getElementById('lifeline-5050');
    const btnDip = document.getElementById('lifeline-doubledip');
    const btnStats = document.getElementById('lifeline-stats');

    btn50.disabled = !lifelines.fifty;
    btnStats.disabled = !lifelines.stats;
    btnDip.disabled = !lifelines.doubleDip && !isDoubleDipActive;
    
    if (isDoubleDipActive) {
        btnDip.style.borderColor = "#fbbf24";
        btnDip.style.boxShadow = "0 0 15px #fbbf24";
        btnDip.classList.add("animate-pulse");
    } else {
        btnDip.style.borderColor = "";
        btnDip.style.boxShadow = "";
        btnDip.classList.remove("animate-pulse");
    }
}