// AANGEPASTE IMPORT (../)
import { fetchTemperature, getFlagEmoji, getCountryName } from '../utils.js';

const CITIES = [
    // --- EUROPA ---
    {name: "Amsterdam", country: "NL", lat: 52.36, lon: 4.90},
    {name: "Rotterdam", country: "NL", lat: 51.92, lon: 4.47},
    {name: "Brussel", country: "BE", lat: 50.85, lon: 4.35},
    {name: "Antwerpen", country: "BE", lat: 51.21, lon: 4.40},
    {name: "Londen", country: "GB", lat: 51.50, lon: -0.12},
    {name: "Manchester", country: "GB", lat: 53.48, lon: -2.24},
    {name: "Parijs", country: "FR", lat: 48.85, lon: 2.35},
    {name: "Marseille", country: "FR", lat: 43.29, lon: 5.36},
    {name: "Berlijn", country: "DE", lat: 52.52, lon: 13.40},
    {name: "München", country: "DE", lat: 48.13, lon: 11.58},
    {name: "Madrid", country: "ES", lat: 40.41, lon: -3.70},
    {name: "Barcelona", country: "ES", lat: 41.38, lon: 2.17},
    {name: "Rome", country: "IT", lat: 41.90, lon: 12.49},
    {name: "Milaan", country: "IT", lat: 45.46, lon: 9.19},
    {name: "Moskou", country: "RU", lat: 55.75, lon: 37.61},
    {name: "Istanbul", country: "TR", lat: 41.00, lon: 28.97},
    {name: "Athene", country: "GR", lat: 37.98, lon: 23.72},
    {name: "Stockholm", country: "SE", lat: 59.32, lon: 18.06},
    {name: "Oslo", country: "NO", lat: 59.91, lon: 10.75},
    {name: "Helsinki", country: "FI", lat: 60.16, lon: 24.93},
    {name: "Reykjavik", country: "IS", lat: 64.14, lon: -21.94},
    {name: "Wenen", country: "AT", lat: 48.20, lon: 16.37},
    {name: "Zurich", country: "CH", lat: 47.37, lon: 8.54},

    // --- NOORD AMERIKA ---
    {name: "New York", country: "US", lat: 40.71, lon: -74.00},
    {name: "Los Angeles", country: "US", lat: 34.05, lon: -118.24},
    {name: "Chicago", country: "US", lat: 41.87, lon: -87.62},
    {name: "Miami", country: "US", lat: 25.76, lon: -80.19},
    {name: "Toronto", country: "CA", lat: 43.65, lon: -79.38},
    {name: "Vancouver", country: "CA", lat: 49.28, lon: -123.12},
    {name: "Mexico City", country: "MX", lat: 19.43, lon: -99.13},

    // --- ZUID AMERIKA ---
    {name: "São Paulo", country: "BR", lat: -23.55, lon: -46.63},
    {name: "Rio de Janeiro", country: "BR", lat: -22.90, lon: -43.17},
    {name: "Buenos Aires", country: "AR", lat: -34.60, lon: -58.38},
    {name: "Santiago", country: "CL", lat: -33.44, lon: -70.66},
    {name: "Lima", country: "PE", lat: -12.04, lon: -77.04},

    // --- AZIË ---
    {name: "Beijing", country: "CN", lat: 39.90, lon: 116.40},
    {name: "Shanghai", country: "CN", lat: 31.23, lon: 121.47},
    {name: "Tokyo", country: "JP", lat: 35.67, lon: 139.65},
    {name: "Osaka", country: "JP", lat: 34.69, lon: 135.50},
    {name: "Mumbai", country: "IN", lat: 19.07, lon: 72.87},
    {name: "Delhi", country: "IN", lat: 28.61, lon: 77.20},
    {name: "Bangkok", country: "TH", lat: 13.75, lon: 100.50},
    {name: "Singapore", country: "SG", lat: 1.35, lon: 103.81},
    {name: "Seoul", country: "KR", lat: 37.56, lon: 126.97},
    {name: "Jakarta", country: "ID", lat: -6.20, lon: 106.84},
    {name: "Dubai", country: "AE", lat: 25.20, lon: 55.27},

    // --- AFRIKA ---
    {name: "Cairo", country: "EG", lat: 30.04, lon: 31.23},
    {name: "Lagos", country: "NG", lat: 6.52, lon: 3.37},
    {name: "Nairobi", country: "KE", lat: -1.29, lon: 36.82},
    {name: "Kaapstad", country: "ZA", lat: -33.92, lon: 18.42},

    // --- OCEANIË ---
    {name: "Sydney", country: "AU", lat: -33.86, lon: 151.20},
    {name: "Melbourne", country: "AU", lat: -37.81, lon: 144.96},
    {name: "Auckland", country: "NZ", lat: -36.84, lon: 174.76}
];

const MONEY_LADDER = [0, 500, 1000, 2000, 5000, 10000, 20000, 50000, 75000, 100000, 250000, 500000, 1000000];

let currentRound = 0;
let currentOptions = []; 
let correctAnswerIndex = -1;
let currentQuestionType = 'warmest';

let scissorsLeft = 3; 
let audienceUsed = false;
let phoneUsed = false;

export function init() {
    currentRound = 1;
    scissorsLeft = 3;
    audienceUsed = false;
    phoneUsed = false;

    document.getElementById('mil-end-screen').classList.add('hidden');
    document.getElementById('mil-game-area').classList.remove('hidden');
    
    updateLifelineButtons();

    for(let i=0; i<4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = () => selectOption(i);
    }

    document.getElementById('lifeline-5050').onclick = useScissors;
    document.getElementById('lifeline-audience').onclick = useAudience;
    document.getElementById('lifeline-call').onclick = usePhoneAFriend;

    loadRound();
}

function updateLifelineButtons() {
    const btnScissors = document.getElementById('lifeline-5050');
    if (scissorsLeft > 0) {
        btnScissors.innerHTML = `✂️ <span class="lifeline-badge">${scissorsLeft}</span>`;
        btnScissors.disabled = false;
        btnScissors.style.opacity = "1";
    } else {
        btnScissors.innerHTML = `✂️`; 
        btnScissors.disabled = true;
        btnScissors.style.opacity = "0.4";
    }

    const btnAud = document.getElementById('lifeline-audience');
    btnAud.disabled = audienceUsed;
    btnAud.style.opacity = !audienceUsed ? "1" : "0.4";

    const btnCall = document.getElementById('lifeline-call');
    btnCall.disabled = phoneUsed;
    btnCall.style.opacity = !phoneUsed ? "1" : "0.4";
}

async function loadRound() {
    document.getElementById('mil-game-area').classList.add('hidden');
    document.getElementById('mil-loading').classList.remove('hidden');
    
    document.getElementById('mil-round').textContent = currentRound;
    document.getElementById('mil-money').textContent = MONEY_LADDER[currentRound-1].toLocaleString();

    const shuffled = [...CITIES].sort(() => 0.5 - Math.random());
    const selectedCities = shuffled.slice(0, 4);

    const promises = selectedCities.map(city => fetchTemperature(city, null));
    const temps = await Promise.all(promises);

    currentOptions = selectedCities.map((city, index) => ({
        ...city,
        temp: temps[index] !== null ? temps[index] : -999
    }));

    const types = ['warmest', 'coldest', 'closest', 'furthest', 'specific_city'];
    currentQuestionType = types[Math.floor(Math.random() * types.length)];
    
    const uniqueTemps = new Set(currentOptions.map(o => o.temp));
    if (currentQuestionType === 'specific_city' && uniqueTemps.size < 4) {
        currentQuestionType = 'warmest';
    }

    generateQuestionAndAnswer();

    for(let i=0; i<4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        const flag = getFlagEmoji(currentOptions[i].country);
        
        if (currentQuestionType === 'specific_city') {
            btn.querySelector('.opt-text').textContent = `${currentOptions[i].temp}°C`;
        } else {
            const countryName = getCountryName(currentOptions[i].country);
            btn.querySelector('.opt-text').innerHTML = `${currentOptions[i].name} ${flag}`;
        }
        
        btn.classList.remove('mil-selected', 'mil-correct', 'mil-wrong', 'hidden');
        btn.disabled = false;
    }

    document.getElementById('mil-loading').classList.add('hidden');
    document.getElementById('mil-game-area').classList.remove('hidden');
}

function generateQuestionAndAnswer() {
    const titleEl = document.querySelector('#mil-game-area h2');
    const sortedByTemp = [...currentOptions].map((opt, idx) => ({...opt, originalIndex: idx})).sort((a, b) => a.temp - b.temp);
    
    if (currentQuestionType === 'warmest') {
        titleEl.textContent = "Welke stad is het warmst? 🔥";
        correctAnswerIndex = sortedByTemp[3].originalIndex;
    } else if (currentQuestionType === 'coldest') {
        titleEl.textContent = "Welke stad is het koudst? ❄️";
        correctAnswerIndex = sortedByTemp[0].originalIndex;
    } else if (currentQuestionType === 'closest') {
        const min = sortedByTemp[0].temp;
        const max = sortedByTemp[3].temp;
        const target = Math.floor(Math.random() * (max - min + 1)) + min;
        titleEl.textContent = `Welke stad zit het dichtst bij ${target}°C? 🎯`;
        
        let minDiff = 9999;
        currentOptions.forEach((opt, idx) => {
            const diff = Math.abs(opt.temp - target);
            if (diff < minDiff) { minDiff = diff; correctAnswerIndex = idx; }
        });
    } else if (currentQuestionType === 'furthest') {
        const target = Math.random() > 0.5 ? 10 : 25;
        titleEl.textContent = `Welke stad is het verst verwijderd van ${target}°C? 📏`;
        
        let maxDiff = -1;
        currentOptions.forEach((opt, idx) => {
            const diff = Math.abs(opt.temp - target);
            if (diff > maxDiff) { maxDiff = diff; correctAnswerIndex = idx; }
        });
    } else if (currentQuestionType === 'specific_city') {
        const subjectIndex = Math.floor(Math.random() * 4);
        const subjectCity = currentOptions[subjectIndex];
        const flag = getFlagEmoji(subjectCity.country);
        titleEl.innerHTML = `Hoe warm is het in ${subjectCity.name} ${flag}? 🌡️`;
        correctAnswerIndex = subjectIndex;
    }
}

function selectOption(index) {
    for(let i=0; i<4; i++) document.getElementById(`opt-${i}`).disabled = true;
    document.getElementById(`opt-${index}`).classList.add('mil-selected');
    setTimeout(() => revealAnswer(index), 1500);
}

function revealAnswer(selectedIndex) {
    const correctBtn = document.getElementById(`opt-${correctAnswerIndex}`);
    correctBtn.classList.remove('mil-selected');
    correctBtn.classList.add('mil-correct');
    
    for(let i=0; i<4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        const opt = currentOptions[i];
        const flag = getFlagEmoji(opt.country);
        
        if (!btn.textContent.includes('(')) {
            if (currentQuestionType === 'specific_city') {
                btn.querySelector('.opt-text').innerHTML += ` (${opt.name} ${flag})`;
            } else {
                btn.querySelector('.opt-text').innerHTML += ` (${opt.temp}°C)`;
            }
        }
    }

    if (selectedIndex === correctAnswerIndex) {
        if(typeof confetti === "function") confetti({ particleCount: 100, spread: 60, origin: { y: 0.7 } });
        setTimeout(() => {
            if (currentRound < 13) {
                currentRound++;
                loadRound();
            } else {
                gameEnd(true);
            }
        }, 3500);
    } else {
        document.getElementById(`opt-${selectedIndex}`).classList.add('mil-wrong');
        setTimeout(() => gameEnd(false), 2000);
    }
}

function gameEnd(won) {
    document.getElementById('mil-game-area').classList.add('hidden');
    document.getElementById('mil-end-screen').classList.remove('hidden');
    const title = document.getElementById('mil-end-title');
    const moneyDisplay = document.getElementById('mil-end-money');

    if (won) {
        title.textContent = "MILJONAIR! 🏆";
        title.className = "text-5xl font-black mb-4 text-green-600";
        moneyDisplay.textContent = "1.000.000";
    } else {
        title.textContent = "HELAAS... 🥀";
        title.className = "text-5xl font-black mb-4 text-red-600";
        const prize = currentRound > 1 ? MONEY_LADDER[currentRound-2] : 0;
        moneyDisplay.textContent = prize.toLocaleString();
    }
}

function useScissors() {
    if (scissorsLeft <= 0) return;

    let wrongOptions = [];
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`opt-${i}`);
        if (i !== correctAnswerIndex && !btn.classList.contains('hidden')) {
            wrongOptions.push(i);
        }
    }

    if (wrongOptions.length > 0) {
        const randomIndex = Math.floor(Math.random() * wrongOptions.length);
        const toRemove = wrongOptions[randomIndex];
        document.getElementById(`opt-${toRemove}`).classList.add('hidden');
        scissorsLeft--;
        updateLifelineButtons();
    }
}

function useAudience() {
    if (audienceUsed) return;
    audienceUsed = true;
    updateLifelineButtons();
    
    const label = ['A','B','C','D'][correctAnswerIndex];
    const flag = getFlagEmoji(currentOptions[correctAnswerIndex].country);
    let antwoordTekst = "";
    
    if (currentQuestionType === 'specific_city') {
        antwoordTekst = `${currentOptions[correctAnswerIndex].temp}°C`;
    } else {
        antwoordTekst = `${currentOptions[correctAnswerIndex].name} ${flag}`;
    }

    alert(`📊 Het publiek stemt massaal op ${label} (${antwoordTekst})! (72%)`);
}

function usePhoneAFriend() {
    if (phoneUsed) return;
    phoneUsed = true;
    updateLifelineButtons();
    
    const correctOpt = currentOptions[correctAnswerIndex];
    const country = getCountryName(correctOpt.country);
    let hint = "";

    if (currentQuestionType === 'warmest') hint = `Ik weet zeker dat ${correctOpt.name} (${country}) heel warm is nu!`;
    else if (currentQuestionType === 'coldest') hint = `Volgens mij vriest het in ${correctOpt.name} (${country}).`;
    else if (currentQuestionType === 'specific_city') hint = `In ${correctOpt.name} (${country}) is het nu ongeveer ${correctOpt.temp} graden.`;
    else hint = `Ik gok op ${correctOpt.name} (${country}), dat klinkt logisch.`;

    alert(`📞 Je weerman vriend zegt: "${hint}"`);
}