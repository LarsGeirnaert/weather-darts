import { API_KEY, FORECAST_API_URL } from '../../config.js';
import { getFlagEmoji, showFloatingText } from '../../utils.js';
import { CITIES_POOL } from '../../data/cities-data.js';

// State
let currentCity1 = null;
let currentCity2 = null;
let temp1 = null;
let temp2 = null;
let score = 0;
let highScore = 0; 
let isProcessing = false;

// Cache om API kosten te sparen
const tempCache = {};

export function init() {
    console.log("⬆️⬇️ Higher/Lower Init");
    
    // 1. LAAD TOPSCORE UIT GEHEUGEN
    const savedHighScore = localStorage.getItem('hl_highscore');
    if (savedHighScore) {
        highScore = parseInt(savedHighScore);
    }

    // Knoppen listeners
    const btnHigher = document.getElementById('hl-btn-higher');
    const btnLower = document.getElementById('hl-btn-lower');
    const btnRestart = document.getElementById('hl-restart-btn');

    if(btnHigher) btnHigher.onclick = () => handleGuess('higher');
    if(btnLower) btnLower.onclick = () => handleGuess('lower');
    if(btnRestart) btnRestart.onclick = resetGame;

    resetGame();
}

async function resetGame() {
    score = 0;
    updateScore();
    
    // UI Reset
    const gameOverScreen = document.getElementById('hl-game-over');
    const gameArea = document.getElementById('hl-game-area');
    
    if(gameOverScreen) gameOverScreen.classList.add('hidden');
    if(gameArea) gameArea.classList.remove('hidden');
    
    // Startsituatie: Kies 2 steden
    await nextRound(true);
}

async function nextRound(firstTime = false) {
    if (isProcessing) return;
    isProcessing = true;
    showLoading(true);

    try {
        const cities = CITIES_POOL;
        
        // Als het de eerste keer is, kies stad 1. Anders schuift stad 2 door naar stad 1.
        if (firstTime) {
            let c1 = cities[Math.floor(Math.random() * cities.length)];
            currentCity1 = c1;
            temp1 = await getTemp(currentCity1);
        } else {
            currentCity1 = currentCity2;
            temp1 = temp2;
        }

        // Kies een nieuwe stad 2 (die niet stad 1 is)
        let c2;
        do {
            c2 = cities[Math.floor(Math.random() * cities.length)];
        } while (c2.name === currentCity1.name);

        currentCity2 = c2;
        temp2 = await getTemp(currentCity2); 

        // UI Update
        renderCards();
        
    } catch (e) {
        console.error("Fout in HL game:", e);
    }

    showLoading(false);
    isProcessing = false;
}

async function handleGuess(guess) {
    if (isProcessing) return;
    
    const isHigher = temp2 >= temp1; 
    const correct = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);

    // Toon het resultaat op de rechter kaart
    revealRightCard();

    if (correct) {
        score++;
        updateScore();
        
        // Visuele feedback (+1)
        const scoreDisplay = document.getElementById('hl-score-display');
        if(scoreDisplay) showFloatingText(scoreDisplay, "+1", "heal");
        
        // GEEN CONFETTI MEER HIER
        
        // Wacht even zodat speler de temp kan zien, dan volgende ronde
        setTimeout(() => {
            nextRound();
        }, 1500);
    } else {
        // Game Over
        setTimeout(() => {
            gameOver();
        }, 1500);
    }
}

function gameOver() {
    // 2. SLA TOPSCORE OP IN GEHEUGEN
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('hl_highscore', highScore);
    }
    
    document.getElementById('hl-game-area').classList.add('hidden');
    document.getElementById('hl-game-over').classList.remove('hidden');
    
    document.getElementById('hl-end-score').innerText = score;
    document.getElementById('hl-high-score').innerText = highScore;
    
    const title = document.getElementById('hl-end-title');
    if (score > 5) {
        title.innerText = "🔥 Goede Streak!";
        title.className = "text-4xl font-black text-orange-500 mb-2";
    } else {
        title.innerText = "Helaas...";
        title.className = "text-4xl font-black text-slate-700 mb-2";
    }
}

// --- HELPER FUNCTIES ---

async function getTemp(cityObj) {
    const cacheKey = `${cityObj.name}-${cityObj.country}`;
    if (tempCache[cacheKey]) return tempCache[cacheKey];

    const url = `${FORECAST_API_URL}?q=${cityObj.name},${cityObj.country}&appid=${API_KEY}&units=metric`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (res.status !== 200) throw new Error("API Error");

        const todayDate = data.list[0].dt_txt.slice(0, 10);
        let maxTemp = -1000;
        for (const item of data.list) {
            if (item.dt_txt.startsWith(todayDate)) {
                if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
            }
        }
        const result = Math.round(maxTemp);
        tempCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.error("Kon temperatuur niet ophalen", e);
        return 0; // Fallback
    }
}

function renderCards() {
    // Links (Bekend)
    document.getElementById('hl-city-1-name').innerHTML = `${getFlagEmoji(currentCity1.country)} ${currentCity1.name}`;
    document.getElementById('hl-city-1-country').innerText = currentCity1.country; 
    document.getElementById('hl-temp-1').innerText = `${temp1}°C`;

    // Rechts (Onbekend)
    document.getElementById('hl-city-2-name').innerHTML = `${getFlagEmoji(currentCity2.country)} ${currentCity2.name}`;
    document.getElementById('hl-city-2-country').innerText = currentCity2.country;
    
    // Reset rechterkant naar "Vraagteken" staat
    const rightTemp = document.getElementById('hl-temp-2');
    rightTemp.innerText = "???";
    rightTemp.className = "text-6xl font-black text-slate-300 my-4";
    
    // Toon knoppen weer
    const buttons = document.getElementById('hl-buttons');
    if(buttons) buttons.classList.remove('hidden');
}

function revealRightCard() {
    const rightTemp = document.getElementById('hl-temp-2');
    rightTemp.innerText = `${temp2}°C`;
    
    // Kleur op basis van hoger/lager
    if (temp2 > temp1) rightTemp.className = "text-6xl font-black text-red-500 my-4 scale-110 transition-transform";
    else if (temp2 < temp1) rightTemp.className = "text-6xl font-black text-blue-500 my-4 scale-110 transition-transform";
    else rightTemp.className = "text-6xl font-black text-slate-600 my-4";

    const buttons = document.getElementById('hl-buttons');
    if(buttons) buttons.classList.add('hidden');
}

function updateScore() {
    const display = document.getElementById('hl-score-display');
    if(display) display.innerText = `Streak: ${score}`;
}

function showLoading(show) {
    const el = document.getElementById('hl-loading');
    if(!el) return;
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}