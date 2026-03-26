// Core App Logic - Flexi Cuentas

// --- State Management ---
const AppState = {
    transactions: JSON.parse(localStorage.getItem('fc_transactions')) || [],
    goals: JSON.parse(localStorage.getItem('fc_goals')) || [],
    accounts: JSON.parse(localStorage.getItem('fc_accounts')) || [{id: 'default', name: 'Cuenta Principal'}],
    settings: JSON.parse(localStorage.getItem('fc_settings')) || {
        baseCurrency: 'CRC',
        theme: 'dark',
        mode: 'neon',
        activePetId: 'beagle',
        activeAccountId: 'default',
        customColor: '#00FFCC',
        customBg: '#0F172A',
        customSurface: '#1E293B'
    },
    unlockedPets: JSON.parse(localStorage.getItem('fc_pets')) || ['beagle', 'cat', 'piggy'],
    pendingUnlocks: JSON.parse(localStorage.getItem('fc_pending_unlocks')) || [],
    lastUnlockDate: localStorage.getItem('fc_last_unlock') || null,
    referentialRate: parseFloat(localStorage.getItem('fc_exchange_rate')) || 500
};

if (!AppState.settings.activeAccountId) AppState.settings.activeAccountId = 'default';
AppState.transactions.forEach(t => { if (!t.accountId) t.accountId = 'default'; });

let currentHistoryFilter = null;

function saveState() {
    localStorage.setItem('fc_transactions', JSON.stringify(AppState.transactions));
    localStorage.setItem('fc_goals', JSON.stringify(AppState.goals));
    localStorage.setItem('fc_accounts', JSON.stringify(AppState.accounts));
    localStorage.setItem('fc_settings', JSON.stringify(AppState.settings));
    localStorage.setItem('fc_pets', JSON.stringify(AppState.unlockedPets));
    localStorage.setItem('fc_pending_unlocks', JSON.stringify(AppState.pendingUnlocks));
    localStorage.setItem('fc_last_unlock', AppState.lastUnlockDate || '');
    localStorage.setItem('fc_exchange_rate', AppState.referentialRate.toString());
    renderApp();
}

function updateExchangeUI() {
    const el = document.getElementById('live-exchange-rate-info');
    if (el) {
        el.innerHTML = `Tipo de cambio: <strong>₡${AppState.referentialRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> <span style="font-size:10px;">(Referencia Hacienda BCCR) 🏛️</span>`;
    }
}

async function fetchLiveExchangeRate() {
    // 1. Official Hacienda CR
    try {
        const response = await fetch('https://api.hacienda.go.cr/indicadores/tc/dolar');
        if (response.ok) {
            const data = await response.json();
            if (data && data.venta && data.venta.valor) {
                AppState.referentialRate = parseFloat(data.venta.valor);
                saveState();
                updateExchangeUI();
                return;
            }
        }
    } catch(e) {}

    // 2. PaginasWeb.cr (Alternative CR source)
    try {
        const response = await fetch('https://tipodecambio.paginasweb.cr/api/venta');
        if (response.ok) {
            const data = await response.json();
            if (data && data.valor) {
                AppState.referentialRate = parseFloat(data.valor);
                saveState();
                updateExchangeUI();
                return;
            }
        }
    } catch(e) {}

    // 3. Global Fallback
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        if (response.ok) {
            const data = await response.json();
            if (data && data.rates && data.rates.CRC) {
                AppState.referentialRate = Math.round(data.rates.CRC * 100) / 100;
                saveState();
                updateExchangeUI();
            }
        }
    } catch(err) {
        updateExchangeUI();
    }
}

// --- Pet System (The Zoo V4 - Pixar Edition) ---
const PetData = [
    { id: 'beagle', name: 'Rastreador', imgSrc: 'assets/img/pixar_beagle.png', type: 'base', skill: '¡Cazador experto de gastos hormiga! 🐾 Te ayuda a rastrear a dónde se va tu dinero.', intro: '¡Guau! Estoy listo para olfatear todos tus gastos ocultos hoy. 🐶🔎' },
    { id: 'cat', name: 'Relajado', imgSrc: 'assets/img/pixar_cat.png', type: 'base', skill: 'Maestro zen del ahorro. 🧘 Te mantiene calmado cuando revisas el estado de cuenta.', intro: 'Miauuu... respira profundo. Dominaremos esos números con muchísima calma. 🐱✨' },
    { id: 'piggy', name: 'Clásica', imgSrc: 'assets/img/pixar_piggy.png', type: 'base', skill: 'Escudo protector de tu patrimonio. 🐷 Alimenta su pancita con cada ahorro que logras.', intro: '¡Oink, oink! ¡Mi pancita está lista para hacer sonar todas esas monedas! 🐽💰' },
    { id: 'lion', name: 'Guardián', imgSrc: 'assets/img/pixar_lion.png', type: 'unlockable', skill: '¡Protección feroz para tus billetes grandes! 🦁 Asusta a las decisiones impulsivas.', intro: '¡ROAAAR! Yo cuidaré de tus billetes grandes. ¡Nadie tocará nuestro tesoro! 🦁👑', unlockCondition: (state) => state.goals.some(g => (g.currency === 'USD' ? g.totalAmount : g.totalAmount/state.referentialRate) > 100) },
    { id: 'panda', name: 'Eco-Ahorrador', imgSrc: 'assets/img/pixar_panda.png', type: 'unlockable', skill: 'Fomenta el minimalismo pacífico. 🐼 Ayuda a evitar las compras innecesarias.', intro: 'Mastiquemos esto lentamente... ¿Realmente ocupabas comprar eso tan rápido? 🐼🎋', unlockCondition: (state) => calculateTotalBalance(state) > 0 },
    { id: 'giraffe', name: 'Visionaria', imgSrc: 'assets/img/pixar_giraffe.png', type: 'unlockable', skill: 'Mantiene tu vista en las metas a larguísimo plazo. 🦒 ¡Casi imposible desviarse!', intro: '¡Desde aquí arriba veo el gran éxito de nuestro futuro! ¡Sigue así! 🦒✨', unlockCondition: (state) => calculateTotalBalance(state) > 1000 },
    { id: 'monkey', name: 'Ágil', imgSrc: 'assets/img/pixar_monkey.png', type: 'unlockable', skill: 'Súper analista de micro-transacciones. 🐒 Se mueve tan rápido como tu propio dinero.', intro: '¡Uh uh ah ah! ¡He contado exactamente cada céntimo que movimos hoy! 🐒🍌', unlockCondition: (state) => state.transactions.length >= 20 },
    { id: 'bunny', name: 'Veloz', imgSrc: 'assets/img/pixar_bunny.png', type: 'unlockable', skill: '¡Acelerador ultra-rápido para metas cortas! 🐰 Celebra tus logros repentinos contigo.', intro: '¡Boing, boing! ¡Vamos saltando directamente hacia el cumplimiento de la meta! 🐰🚀', unlockCondition: (state) => state.goals.some(g => g.savedAmount >= g.totalAmount) },
    { id: 'penguin', name: 'Calculador', imgSrc: 'assets/img/pixar_penguin.png', type: 'unlockable', skill: 'El contador de hielo. 🐧 Mantiene todos los presupuestos estrictamente congelados.', intro: 'Mis matemáticas no mienten. ¡El presupuesto se mantiene frío y congelado! 🐧❄️', unlockCondition: (state) => state.transactions.filter(t => t.type === 'expense').length >= 10 },
    { id: 'cow', name: 'Rendidora', imgSrc: 'assets/img/pixar_cow.png', type: 'unlockable', skill: 'Maximizadora de Ingresos.', unlockCondition: (state) => state.transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.currency === 'USD' ? t.amount : t.amount/state.referentialRate), 0) > 1000 },
    { id: 'sloth', name: 'Zen', imgSrc: 'assets/img/pixar_sloth.png', type: 'unlockable', skill: 'Promueve gastos muy pensados y a ritmo lento.', unlockCondition: (state) => state.transactions.filter(t => t.type === 'income').length >= 5 },
    { id: 'toucan', name: 'Atento', imgSrc: 'assets/img/pixar_toucan.png', type: 'unlockable', skill: 'Mantiene visión panorámica en tus finanzas.', unlockCondition: (state) => state.goals.length >= 2 },
    { id: 'frog', name: 'Saltarín', imgSrc: 'assets/img/pixar_frog.png', type: 'unlockable', skill: 'Rebote rápido después de grandes gastos.', unlockCondition: (state) => state.transactions.filter(t => t.type === 'expense').length >= 5 },
    { id: 'fox', name: 'Astuto', imgSrc: 'assets/img/pixar_fox.png', type: 'unlockable', skill: 'Cazador de ofertas inteligentes.', unlockCondition: (state) => calculateTotalBalance(state) > 5000 },
    { id: 'turtle', name: 'Sabio', imgSrc: 'assets/img/pixar_turtle.png', type: 'unlockable', skill: 'Inversor a largo plazo, lento pero invencible.', unlockCondition: (state) => state.goals.filter(g => g.savedAmount > 0).length >= 1 },
    { id: 'butterfly', name: 'Transformación', imgSrc: 'assets/img/pixar_butterfly.png', type: 'unlockable', skill: 'Evolución financiera hacia la libertad. Se desbloquea con el tiempo.', unlockCondition: (state) => calculateTotalBalance(state) > 10000 },
    { id: 'placeholder', name: 'Próximamente', icon: '👤', type: 'locked', skill: 'Misterio...', unlockCondition: () => false }
];

function checkUnlocks() {
    let newlyPending = false;
    PetData.forEach(pet => {
        if (pet.type === 'unlockable' && !AppState.unlockedPets.includes(pet.id) && !AppState.pendingUnlocks.includes(pet.id)) {
            if (pet.unlockCondition && pet.unlockCondition(AppState)) {
                AppState.pendingUnlocks.push(pet.id);
                newlyPending = true;
            }
        }
    });
    if (newlyPending) saveState();
}

window.claimPet = function(petId) {
    const today = new Date().toISOString().split('T')[0];
    if (AppState.lastUnlockDate === today) {
        alert('Ya liberaste una mascota mágica hoy ✨. ¡Vuelve mañana para descubrir nuevos amigos!');
        return;
    }
    
    AppState.unlockedPets.push(petId);
    AppState.pendingUnlocks = AppState.pendingUnlocks.filter(id => id !== petId);
    AppState.lastUnlockDate = today;
    saveState();
    alert('¡Wohooo! 🎉 ¡Tu nueva mascota se unió a tu Zoológico Financiero! Ve a elegirla.');
}

// --- Cinematic Static AI ---
let consecutiveExpenses = 0; 
const Companion = {
    msgEl: null,
    
    init() {
        this.msgEl = document.getElementById('pet-message');
    },
    
    getEl() {
        return document.querySelector('#active-pet-wrapper > *');
    },

    interact() {
        const activePet = PetData.find(p => p.id === AppState.settings.activePetId) || PetData[0];
        const day = new Date().getDay();
        
        let dailyGreeting = "";
        if (day === 1) dailyGreeting = "¡Feliz Lunes! 🔋 Empecemos la semana con toda la energía.";
        else if (day === 2) dailyGreeting = "¡Maravilloso Martes! 🎯 Sigamos enfocados en la meta.";
        else if (day === 3) dailyGreeting = "¡Miércoles, mitad de semana! 🐪 Ya casi llegamos.";
        else if (day === 4) dailyGreeting = "¡Jueves! 📈 Prepárate para cerrar la semana con éxito.";
        else if (day === 5) dailyGreeting = "¡Viernes al fin! 🎊 Recuerda cuidar tu dinero el finde.";
        else if (day === 6) dailyGreeting = "¡Sábado de relax! 🏖️ Está bien darse un pequeño gusto hoy.";
        else if (day === 0) dailyGreeting = "¡Domingo familiar! 📅 Aprovecha para planear tu próxima semana.";

        const msg = `<span style="display:block;margin-bottom:5px;font-size:12px;color:rgba(255,255,255,0.7);">${dailyGreeting}</span>${activePet.intro || `¡Hola! Soy ${activePet.name}. ${activePet.skill}`}`;
        this.say(msg, 5000);
    },
    
    say(text, duration = 4000) {
        if(!this.msgEl || AppState.settings.hidePet) return;
        this.msgEl.innerHTML = text;
        this.msgEl.classList.add('visible');
        setTimeout(() => {
            if(this.msgEl) this.msgEl.classList.remove('visible');
        }, duration);
    },
    
    cinematicCelebration() {
        consecutiveExpenses = 0;
        const target = document.getElementById('pet-container');
        const visualEl = this.getEl();
        if(!visualEl) return;

        // Reset
        visualEl.className = visualEl.tagName === 'IMG' ? 'pixar-pet-avatar' : 'emoji-pet-avatar';
        void visualEl.offsetWidth;
        visualEl.className += ' pixar-celebrate';
        
        document.body.classList.add('cinematic-darken');
        this.say('¡VICTORIA FINANCIERA! 🎉🚀', 5000);
        fireworks();
        
        setTimeout(() => {
            if(visualEl) visualEl.classList.remove('pixar-celebrate');
            document.body.classList.remove('cinematic-darken');
        }, 5000);
    },
    
    empathyTrigger() {
        consecutiveExpenses++;
        const visualEl = this.getEl();
        if(!visualEl) return;

        if (consecutiveExpenses >= 2) {
            visualEl.className = visualEl.tagName === 'IMG' ? 'pixar-pet-avatar' : 'emoji-pet-avatar';
            void visualEl.offsetWidth;
            visualEl.className += ' pixar-empathy';
            
            const day = new Date().getDay();
            let msgs = [];
            
            if (day === 0 || day === 5 || day === 6) { 
                // Fin de semana (Viernes, Sábado, Domingo)
                msgs = [
                    "¡Gastos de fin de semana detectados! 🎉 Disfruta con inteligencia.",
                    "Relájate, es finde. 🏖️ Pero no pierdas de vista tu meta de ahorro.",
                    "Salir a disfrutar está bien. ¡Te ganaste ese descanso! 🍕 Solo no olvides registrarlo todo.",
                    "¡Ups! Rompiendo un poquito el chancho hoy, ¿eh? ¡Pásala increíble hoy! 🎊"
                ];
            } else {
                // Entre semana (Lunes a Jueves)
                msgs = [
                    "¡Ouch! Ese gasto dolió, pero anotar es de grandes líderes. ¡Tú puedes recuperarte! 💪",
                    "¡No te preocupes! Todo genio tiene sus resbalones. Lo importante es mantener el control. ❤️",
                    "¡Respira profundo, campeón! La organización siempre trae muchísima paz financiera. 🐾",
                    "El dinero a veces tiene que salir para que entre más. ¡Mantén fuerte la disciplina semanal! 🔥"
                ];
            }
            this.say(`<span style="color:var(--accent-primary); font-weight:800;">Aviso:</span><br/>${msgs[Math.floor(Math.random() * msgs.length)]}`, 6000);
            
            setTimeout(() => {
                if(visualEl) visualEl.classList.remove('pixar-empathy');
            }, 6000);
        } else {
            const day = new Date().getDay();
            if (day === 0 || day === 5 || day === 6) {
                this.say("¡Gasto de fin de semana anotado! 📅 A disfrutar sin remordimientos.", 3000);
            } else {
                this.say("¡Anotado con éxito! Mantener el registro es tu súper-poder. 📋✨", 3000);
            }
        }
    },
    
    grandGoalCelebration(goal) {
        document.body.classList.add('cinematic-darken');
        const overlay = document.getElementById('grand-celebration-overlay');
        const msgEl = document.getElementById('celebration-msg');
        
        const messages = [
            `¡Increíble disciplina! Has demostrado que con confianza todo se logra. "<strong>${goal.title}</strong>" es una realidad.`,
            `¡Eres una máquina de ahorro! Este esfuerzo rinde grandes frutos hoy. Disfruta tu meta "<strong>${goal.title}</strong>".`,
            `¡Felicidades por no rendirte! El esfuerzo constante es tu gran recompensa hoy. Has alcanzado "<strong>${goal.title}</strong>".`,
            `¡Histórico! Has roto límites financieros. Ahora disfruta tu éxito con tu meta "<strong>${goal.title}</strong>".`
        ];
        
        if (msgEl) msgEl.innerHTML = messages[Math.floor(Math.random() * messages.length)];
        if (overlay) overlay.classList.add('active');
        
        // Massive fireworks in center
        for (let i = 0; i < 4; i++) {
            setTimeout(() => fireworks(window.innerWidth/2 - 50, window.innerHeight/2 + (Math.random()*100 - 50)), i * 600);
            setTimeout(() => fireworks(window.innerWidth/2 + (Math.random()*200 - 100), window.innerHeight/2 + 100), i * 800 + 300);
        }
        
        // Let it display for 6 seconds
        setTimeout(() => {
            if (overlay) overlay.classList.remove('active');
            document.body.classList.remove('cinematic-darken');
            // Show release modal exactly after the overlay disappears
            openReleaseGoalModal(goal.id);
        }, 6000);
    }
};

function fireworks(centerX, centerY) {
    const colors = ['#00FFCC', '#CCFF00', '#FF00CC', '#00CCFF', '#FFFFFF', AppState.settings.customColor];
    const container = document.getElementById('pet-container');
    const rect = container ? container.getBoundingClientRect() : {left: window.innerWidth/2, top: window.innerHeight/2};

    for(let i=0; i<60; i++) {
        const p = document.createElement('div');
        p.className = 'firework-particle';
        document.body.appendChild(p);
        
        const xPos = centerX !== undefined ? centerX : rect.left + 50;
        const yPos = centerY !== undefined ? centerY : rect.top + 50;
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = 50 + Math.random() * 300;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity - 150; 
        
        p.style.left = xPos + 'px';
        p.style.top = yPos + 'px';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        p.animate([
            { transform: `translate3d(0,0,0) scale(1)`, opacity: 1 },
            { transform: `translate3d(${vx}px, ${vy + 400}px, 0) scale(0)`, opacity: 0 }
        ], {
            duration: 1500 + Math.random() * 1000,
            easing: 'cubic-bezier(.11, .6, .4, 1)',
            fill: 'forwards'
        });
        
        setTimeout(() => p.remove(), 3000);
    }
    
    const wave = document.createElement('div');
    wave.className = 'shockwave';
    const xPos = centerX !== undefined ? centerX : rect.left + 50;
    const yPos = centerY !== undefined ? centerY : rect.top + 50;
    wave.style.left = (xPos - 100) + 'px';
    wave.style.top = (yPos - 100) + 'px';
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 1000);
}


// --- Core Financial Logic ---
function convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    if (fromCurrency === 'USD' && toCurrency === 'CRC') return amount * AppState.referentialRate;
    if (fromCurrency === 'CRC' && toCurrency === 'USD') return amount / AppState.referentialRate;
    return amount;
}

function calculateTotalBalance(state = AppState) {
    let balanceBase = 0;
    const accountTxs = state.transactions.filter(t => t.accountId === state.settings.activeAccountId);
    accountTxs.forEach(t => {
        let amountCRC = convertAmount(t.amount, t.currency, 'CRC');
        if (t.type === 'income') balanceBase += amountCRC;
        else if (t.type === 'expense') balanceBase -= amountCRC;
    });
    return convertAmount(balanceBase, 'CRC', state.settings.baseCurrency);
}

function syncGoalFromTxEdit(oldTx, newAmount, isDeleted = false) {
    if (oldTx.isGoal) {
        let title = oldTx.category.replace('Ahorro: ', '');
        title = title.replace('Liberación de Meta: ', '');
        const goal = AppState.goals.find(g => g.title === title && g.currency === oldTx.currency);
        
        if (goal) {
            if (oldTx.category.startsWith('Ahorro:')) {
                goal.savedAmount -= oldTx.amount;
                if (!isDeleted) goal.savedAmount += newAmount;
                if (goal.savedAmount < 0) goal.savedAmount = 0;
                if (goal.savedAmount < goal.totalAmount) goal.isReleased = false; 
            }
            if (oldTx.category.startsWith('Liberación de Meta:') && isDeleted) {
                goal.isReleased = false;
            }
        }
    }
}

function addTransaction(type, amount, currency, category, isGoal = false, overrideAccountId = null) {
    AppState.transactions.push({
        id: Date.now().toString(),
        accountId: overrideAccountId || AppState.settings.activeAccountId,
        type,
        amount: parseFloat(amount),
        currency,
        category,
        isGoal: isGoal || false,
        date: new Date().toISOString()
    });
    
    checkUnlocks();
    saveState();
    
    if (type === 'income') {
        Companion.cinematicCelebration();
    } else {
        Companion.empathyTrigger();
    }
}

// --- UI Rendering ---
function renderDailyFeed() {
    const feedContainer = document.getElementById('daily-feed-list');
    if (!feedContainer) return;
    feedContainer.innerHTML = '';
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysTx = AppState.transactions.filter(t => t.accountId === AppState.settings.activeAccountId && t.date.startsWith(todayStr));
    
    let totalIn = 0;
    let totalOut = 0;
    
    if (todaysTx.length === 0) {
        feedContainer.innerHTML = '<p class="text-secondary text-center mt-15">Sin movimientos hoy. ¡Descansa!</p>';
        document.getElementById('feed-summary-in').textContent = '+ ₡0';
        document.getElementById('feed-summary-out').textContent = '- ₡0';
        return;
    }
    
    [...todaysTx].reverse().forEach(tx => {
        const amountCRC = convertAmount(tx.amount, tx.currency, 'CRC');
        if (tx.type === 'income') totalIn += amountCRC;
        else totalOut += amountCRC;
        
        const el = document.createElement('div');
        el.className = 'feed-item';
        el.style.cursor = 'pointer';
        el.onclick = () => openEditTxModal(tx.id);
        const isGoalTx = tx.isGoal || tx.category.startsWith('Ahorro:');
        const sign = tx.type === 'income' ? '+' : '-';
        const colorClass = isGoalTx ? '' : (tx.type === 'income' ? 'text-income' : 'text-expense');
        const displayCurrency = tx.currency === 'CRC' ? '₡' : '$';
        
        const timeStr = new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const feedIconStr = isGoalTx ? (tx.type === 'income' ? '🎉' : '🗄️') : (tx.type === 'income' ? '💸' : '🛒');

        el.innerHTML = `
            <div class="feed-icon">${feedIconStr}</div>
            <div class="feed-info">
                <h4>${tx.category}</h4>
                <span>${timeStr}</span>
            </div>
            <div class="feed-amount ${colorClass}" style="${isGoalTx ? 'color: var(--accent-primary);' : ''}">${sign}${displayCurrency}${tx.amount.toLocaleString()}</div>
        `;
        feedContainer.appendChild(el);
    });
    
    document.getElementById('feed-summary-in').textContent = `+ ₡${totalIn.toLocaleString()}`;
    document.getElementById('feed-summary-out').textContent = `- ₡${totalOut.toLocaleString()}`;
}

function renderHistory() {
    const tabsContainer = document.getElementById('history-tabs');
    const listContainer = document.getElementById('history-list-container');
    if (!tabsContainer || !listContainer) return;

    const activeAccountTxs = AppState.transactions.filter(t => t.accountId === AppState.settings.activeAccountId);

    if (activeAccountTxs.length === 0) {
        tabsContainer.innerHTML = '';
        listContainer.innerHTML = '<p class="text-secondary text-center mt-20">No tienes movimientos registrados aún en esta cuenta.</p>';
        return;
    }

    const currentYear = new Date().getFullYear();
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    // Group transactions
    const groups = {};
    activeAccountTxs.forEach(tx => {
        const d = new Date(tx.date);
        const y = d.getFullYear();
        let groupKey = '';
        
        if (y === currentYear) {
            groupKey = `${months[d.getMonth()]} ${y}`;
        } else {
            groupKey = `Año ${y}`;
        }
        
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(tx);
    });
    
    // Sort keys properly
    const keys = Object.keys(groups).sort((a, b) => {
        const yearA = parseInt(a.slice(-4));
        const yearB = parseInt(b.slice(-4));
        if (yearA !== yearB) return yearB - yearA;
        if (a.startsWith('Año') && b.startsWith('Año')) return 0;
        if (a.startsWith('Año')) return 1;
        if (b.startsWith('Año')) return -1;
        const mA = months.indexOf(a.split(' ')[0]);
        const mB = months.indexOf(b.split(' ')[0]);
        return mB - mA;
    });

    if (!currentHistoryFilter || !groups[currentHistoryFilter]) {
        currentHistoryFilter = keys[0];
    }

    // Render Tabs
    tabsContainer.innerHTML = '';
    keys.forEach(key => {
        const tab = document.createElement('div');
        tab.className = `month-tab ${key === currentHistoryFilter ? 'active' : ''}`;
        tab.textContent = key;
        tab.onclick = () => {
            currentHistoryFilter = key;
            renderHistory();
        };
        tabsContainer.appendChild(tab);
    });

    // Render List
    listContainer.innerHTML = '';
    const activeTxs = groups[currentHistoryFilter] || [];
    
    const daysEn = {};
    activeTxs.forEach(tx => {
        const d = new Date(tx.date);
        const dayKey = currentHistoryFilter.startsWith('Año') 
            ? `${months[d.getMonth()]} ${d.getFullYear()}` 
            : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            
        if (!daysEn[dayKey]) daysEn[dayKey] = [];
        daysEn[dayKey].push(tx);
    });

    // Sort days descending
    const sortedDays = Object.keys(daysEn).sort((a, b) => new Date(daysEn[b][0].date) - new Date(daysEn[a][0].date));

    sortedDays.forEach((day, index) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'history-day-group';
        
        let dailyTotalIn = 0;
        let dailyTotalOut = 0;
        
        const feedListWrap = document.createElement('div');
        feedListWrap.className = 'collapsible-container';
        
        const feedListOuter = document.createElement('div');
        feedListOuter.className = 'collapsible-inner';
        
        const feedList = document.createElement('div');
        feedList.className = 'feed-list mt-15';
        
        [...daysEn[day]].reverse().forEach(tx => {
            const amountCRC = convertAmount(tx.amount, tx.currency, 'CRC');
            if (tx.type === 'income') dailyTotalIn += amountCRC;
            else dailyTotalOut += amountCRC;

            const el = document.createElement('div');
            el.className = 'feed-item glass-effect';
            el.style.cursor = 'pointer';
            el.onclick = () => openEditTxModal(tx.id);
            const isGoalTx = tx.isGoal || tx.category.startsWith('Ahorro:');
            const sign = tx.type === 'income' ? '+' : '-';
            const colorClass = isGoalTx ? '' : (tx.type === 'income' ? 'text-income' : 'text-expense');
            const displayCurrency = tx.currency === 'CRC' ? '₡' : '$';
            const timeStr = new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const feedIconStr = isGoalTx ? (tx.type === 'income' ? '🎉' : '🗄️') : (tx.type === 'income' ? '💸' : '🛒');
            
            el.innerHTML = `
                <div class="feed-icon" style="background: rgba(0,0,0,0.2);">${feedIconStr}</div>
                <div class="feed-info">
                    <h4>${tx.category}</h4>
                    <span>${timeStr}</span>
                </div>
                <div class="feed-amount ${colorClass}" style="${isGoalTx ? 'color: var(--accent-primary);' : ''}">${sign}${displayCurrency}${tx.amount.toLocaleString()}</div>
            `;
            feedList.appendChild(el);
        });
        
        const balanceNum = dailyTotalIn - dailyTotalOut;
        const summaryText = balanceNum >= 0 
            ? `<span class="text-income">+₡${balanceNum.toLocaleString()} bal.</span>`
            : `<span class="text-expense">-₡${Math.abs(balanceNum).toLocaleString()} bal.</span>`;
            
        const headerDiv = document.createElement('div');
        headerDiv.className = index === 0 ? 'history-day-header open' : 'history-day-header';
        headerDiv.onclick = function() { this.classList.toggle('open'); };
        headerDiv.innerHTML = `${day} <span style="margin-left:auto; font-size:12px; text-transform:none;">${summaryText}</span><span class="accordion-icon">▼</span>`;
        
        feedListOuter.appendChild(feedList);
        feedListWrap.appendChild(feedListOuter);

        groupEl.appendChild(headerDiv);
        groupEl.appendChild(feedListWrap);
        listContainer.appendChild(groupEl);
    });
}

function renderZoo() {
    const zooList = document.getElementById('zoo-list');
    if (!zooList) return;
    zooList.innerHTML = '';

    PetData.forEach(pet => {
        const isUnlocked = AppState.unlockedPets.includes(pet.id);
        const isPending = AppState.pendingUnlocks.includes(pet.id);
        const isActive = AppState.settings.activePetId === pet.id;
        
        const widget = document.createElement('div');
        widget.className = `widget glass-effect pet-zoo-card ${isUnlocked || isPending ? 'unlocked' : 'locked'} ${isActive ? 'active-pet' : ''}`;
        
        let actionsHTML = '';
        if (isActive) {
            actionsHTML = `<p class="mt-15" style="color:var(--accent-primary); font-weight:800;">⭐ Mascota Activa</p>`;
        } else if (isUnlocked) {
            actionsHTML = `<button class="btn-action btn-primary mt-15" onclick="setActivePet('${pet.id}')">Elegir Mascota</button>`;
        } else if (isPending) {
            actionsHTML = `<button class="btn-action btn-claim mt-15" onclick="claimPet('${pet.id}')">🎁 Reclamar Mascota (1/Día)</button>`;
        } else if (pet.type !== 'locked') {
            actionsHTML = `<p class="locked-text">🔒 Sigue usándolo para desbloquear.</p>`;
        }

        widget.innerHTML = `
            <div class="zoo-avatar">${isUnlocked || isPending ? (pet.imgSrc ? `<img src="${pet.imgSrc}" class="zoo-img">` : pet.icon) : '❓'}</div>
            <div class="zoo-details" style="width:100%;">
                <h3>${pet.name}</h3>
                <p>${pet.skill}</p>
                ${actionsHTML}
            </div>
        `;
        zooList.appendChild(widget);
    });
}

window.setActivePet = function(petId) {
    if (AppState.unlockedPets.includes(petId)) {
        AppState.settings.activePetId = petId;
        saveState();
        Companion.say("¡Listo para revisar el balance!", 3000);
    }
}

function renderGoals() {
    const goalsList = document.getElementById('goals-list');
    if (!goalsList) return;
    goalsList.innerHTML = '';

    if (AppState.goals.length === 0) {
        goalsList.innerHTML = '<p class="text-secondary text-center">No tienes metas activas. ¡Crea una!</p>';
        return;
    }

    AppState.goals.forEach(goal => {
        const today = new Date();
        const target = new Date(goal.targetDate);
        const daysRemaining = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));
        const amountRemaining = Math.max(0, goal.totalAmount - goal.savedAmount);
        const dailyQuota = amountRemaining / daysRemaining;
        const progressPct = Math.min(100, (goal.savedAmount / goal.totalAmount) * 100);

        const quotaMode = goal.quotaMode || 'daily';
        let quotaMultiplier = 1;
        if (quotaMode === 'weekly') quotaMultiplier = 7;
        if (quotaMode === 'monthly') quotaMultiplier = 30;
        const finalQuota = dailyQuota * quotaMultiplier;

        const widget = document.createElement('div');
        widget.className = 'widget glass-effect goal-widget';
        widget.innerHTML = `
            <div class="goal-header">
                <div>
                    <h3>${goal.title}</h3>
                    <span style="font-weight: 800; color: var(--accent-primary); font-size: 18px;">${goal.currency === 'CRC' ? '₡' : '$'} ${goal.totalAmount.toLocaleString()}</span>
                </div>
                <button class="icon-btn" onclick="deleteGoal('${goal.id}')" style="width: 35px; height: 35px; font-size: 15px; color: var(--color-expense); background: rgba(255,0,0,0.1); box-shadow: none;" title="Eliminar Meta">🗑️</button>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
            </div>
            <div class="goal-stats">
                <p>Acumulado: ${goal.savedAmount.toLocaleString()}</p>
                <p>Faltan: <strong>${amountRemaining.toLocaleString()} ${goal.currency}</strong></p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <p>Cuota sugerida: <strong>${Math.ceil(finalQuota).toLocaleString()} ${goal.currency}</strong></p>
                    <select onchange="window.updateQuotaMode('${goal.id}', this.value)" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 12px; padding: 3px 8px; font-family: var(--font-main); font-weight: 600; outline: none; cursor: pointer;">
                        <option value="daily" style="color:#000" ${quotaMode === 'daily' ? 'selected' : ''}>por día</option>
                        <option value="weekly" style="color:#000" ${quotaMode === 'weekly' ? 'selected' : ''}>por sem.</option>
                        <option value="monthly" style="color:#000" ${quotaMode === 'monthly' ? 'selected' : ''}>por mes</option>
                    </select>
                </div>
                <p>${daysRemaining} días restantes</p>
            </div>
            ${progressPct >= 100 && !goal.isReleased ? 
                `<button class="btn-action btn-income mt-15" style="box-shadow: 0 0 15px var(--accent-secondary);" onclick="openReleaseGoalModal('${goal.id}')">🎉 Liberar Fondos</button>` 
                : 
                (goal.isReleased ? 
                    `<button class="btn-action mt-15" style="opacity:0.5; cursor:not-allowed;" disabled>Meta Completada y Liberada</button>`
                    : `<button class="btn-action btn-primary mt-15" onclick="openDepositGoalModal('${goal.id}')">+ Abonar</button>`)
            }
        `;
        goalsList.appendChild(widget);
    });
}

window.openDepositGoalModal = function(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal) return;
    document.getElementById('deposit-goal-id').value = goal.id;
    document.getElementById('deposit-goal-amount').value = '';
    
    const accountSelect = document.getElementById('deposit-goal-account');
    accountSelect.innerHTML = '';
    AppState.accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name;
        if (acc.id === AppState.settings.activeAccountId) opt.selected = true;
        accountSelect.appendChild(opt);
    });
    
    document.getElementById('deposit-goal-modal').classList.add('active');
    setTimeout(() => document.getElementById('deposit-goal-amount').focus(), 100);
}

window.openReleaseGoalModal = function(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal) return;
    document.getElementById('release-goal-id').value = goal.id;
    
    const accountSelect = document.getElementById('release-goal-account');
    accountSelect.innerHTML = '';
    AppState.accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name;
        if (acc.id === AppState.settings.activeAccountId) opt.selected = true;
        accountSelect.appendChild(opt);
    });
    
    document.getElementById('release-goal-modal').classList.add('active');
}

window.deleteGoal = function(goalId) {
    if (confirm('¿Estás seguro de que deseas eliminar esta meta? Todo el historial de ahorros continuará registrado en tus cuentas, solo desaparecerá de aquí.')) {
        AppState.goals = AppState.goals.filter(g => g.id !== goalId);
        saveState();
    }
}

window.updateQuotaMode = function(goalId, mode) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (goal) {
        goal.quotaMode = mode;
        saveState(); // Relicotea los montos re-renderizando las metas
    }
}

window.openEditTxModal = function(txId) {
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx) return;
    
    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-currency').value = tx.currency;
    document.getElementById('edit-tx-category').value = tx.category;
    
    document.getElementById('edit-tx-modal').classList.add('active');
}

window.openReportModal = function() {
    const now = new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    document.getElementById('report-month').value = `${now.getFullYear()}-${mm}`;
    document.getElementById('report-modal').classList.add('active');
};

window.toggleReportFilters = function(type) {
    document.getElementById('report-month-group').style.display = type === 'month' ? 'block' : 'none';
    document.getElementById('report-range-group').style.display = type === 'range' ? 'flex' : 'none';
};

const ReportGenerator = {
    generateAndDownload: function() {
        const filterType = document.getElementById('report-filter-type').value;
        const activeTxs = AppState.transactions.filter(t => t.accountId === AppState.settings.activeAccountId);
        
        let filteredTxs = [];
        let periodName = "Reporte Completo";
        
        if (filterType === 'all') {
            filteredTxs = activeTxs;
            periodName = "Todo el Historial";
        } else if (filterType === 'month') {
            const mVal = document.getElementById('report-month').value; // YYYY-MM
            if (!mVal) { alert('Selecciona un mes válido.'); return; }
            const [y, m] = mVal.split('-');
            filteredTxs = activeTxs.filter(t => new Date(t.date).getFullYear() == parseInt(y) && new Date(t.date).getMonth() == (parseInt(m)-1));
            const dateObj = new Date(y, m-1, 1);
            let name = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            periodName = name.charAt(0).toUpperCase() + name.slice(1);
        } else if (filterType === 'range') {
            const startStr = document.getElementById('report-start-date').value;
            const endStr = document.getElementById('report-end-date').value;
            if (!startStr || !endStr) { alert('Por favor, selecciona las dos fechas del rango.'); return; }
            const startDate = new Date(startStr); startDate.setHours(0,0,0,0);
            startDate.setDate(startDate.getDate() + 1); // timezone bug fix on string initialization
            const endDate = new Date(endStr); endDate.setHours(23,59,59,999);
            endDate.setDate(endDate.getDate() + 1);
            
            filteredTxs = activeTxs.filter(t => {
                const d = new Date(t.date);
                return d >= startDate && d <= endDate;
            });
            periodName = `Desde ${startDate.toLocaleDateString('es-ES')} hasta ${endDate.toLocaleDateString('es-ES')}`;
        }

        let totalIncome = 0;
        let totalExpense = 0;
        let hormigaCount = 0;
        let hormigaTotalBase = 0;
        let categoryMap = {};
        
        filteredTxs.forEach(t => {
            const amtBase = convertAmount(t.amount, t.currency, AppState.settings.baseCurrency);
            const amtUSD = convertAmount(t.amount, t.currency, 'USD');
            
            if (t.type === 'income') {
                totalIncome += amtBase;
            } else {
                totalExpense += amtBase;
                if (!categoryMap[t.category]) categoryMap[t.category] = 0;
                categoryMap[t.category] += amtBase;
                
                // Gasto Hormiga: menor a ~$10 USD, no es ahorro, no es "factura"
                if (amtUSD < 10 && !t.isGoal && !t.category.toLowerCase().includes('factura') && !t.category.toLowerCase().includes('supermercado')) {
                    hormigaCount++;
                    hormigaTotalBase += amtBase;
                }
            }
        });
        
        const netSaving = totalIncome - totalExpense;
        let topCategory = "Ninguna";
        let topCategoryAmt = 0;
        for (const [cat, amt] of Object.entries(categoryMap)) {
            if (amt > topCategoryAmt && !cat.startsWith('Ahorro:')) {
                topCategory = cat;
                topCategoryAmt = amt;
            }
        }
        
        let analysisHtml = "";
        let fort = [];
        if (netSaving > 0) fort.push(`Tu balance es positivo por <strong>${Math.floor(netSaving).toLocaleString()} ${AppState.settings.baseCurrency}</strong>. ¡Gran capacidad de retención!`);
        if (hormigaTotalBase < (totalExpense * 0.1) && totalExpense > 0) fort.push(`Excelente control en micro-gastos. Las compras impulsivas representan una fracción muy baja de tus salidas de dinero.`);
        if (filteredTxs.some(t => t.isGoal && t.type === 'expense')) fort.push(`Registraste importantes aportes a tus Metas de Ahorro. Mantener la disciplina a largo plazo es la verdadera clave de la riqueza.`);
        if (fort.length === 0) fort.push("¡Buen inicio! Registrar tus movimientos ya es el primer gran paso para construir salud financiera.");
        
        let mej = [];
        if (totalExpense > totalIncome * 1.5 && totalIncome > 0) mej.push(`Tus gastos superaron ampliamente tus ingresos en este periodo. Evalúa si se debió a un cobro excepcional o si estás incurriendo en deudas.`);
        if (hormigaCount > 4) mej.push(`Se detectaron <strong>${hormigaCount} "Gastos Hormiga"</strong> que sumaron <strong>${Math.floor(hormigaTotalBase).toLocaleString()} ${AppState.settings.baseCurrency}</strong>. Son pequeñas compras (bocadillos, micro-pagos) que desangran tu billetera silenciosamente. Prueba planificarlas desde casa.`);
        if (topCategory !== "Ninguna" && (topCategoryAmt > totalExpense * 0.4)) mej.push(`Atención con la categoría <strong>"${topCategory}"</strong>, ya que devoró el ${Math.floor((topCategoryAmt/totalExpense)*100)}% de todos tus gastos (${Math.floor(topCategoryAmt).toLocaleString()} ${AppState.settings.baseCurrency}). Considera optimizarla el próximo mes.`);
        if (mej.length === 0) mej.push("Tus finanzas están en un estado asombroso. Sigue cuidando tu economía con la misma vigilancia.");

        analysisHtml += `<div class="insight-box insight-good"><h3>🌟 Lo que has hecho de Lujo</h3><ul>${fort.map(f => `<li>${f}</li>`).join('')}</ul></div>`;
        analysisHtml += `<div class="insight-box insight-bad"><h3>🛠️ Analítica Crítica (Áreas de Mejora)</h3><ul>${mej.map(m => `<li>${m}</li>`).join('')}</ul></div>`;
        
        const petTips = [
            "Flexi-Mascota dice: ¡Un colón ahorrado es un colón ganado!",
            "Flexi-Mascota dice: Revisa siempre este reporte para conocer tu verdadero comportamiento de consumo.",
            "Flexi-Mascota dice: Aléjate de las compras impulsivas a la medianoche."
        ];
        
        const htmlDoc = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte Financiero FlexiCuentas - ${periodName}</title>
    <style>
        body { font-family: 'Inter', 'Segoe UI', sans-serif; background: #fdfdfd; color: #1e293b; line-height: 1.6; padding: 40px; margin:0; }
        .container { max-width: 850px; margin: 0 auto; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,0.06); padding: 50px; border-radius: 20px; border-top: 10px solid ${AppState.settings.customColor}; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;}
        .header h1 { color: #0f172a; font-size: 36px; margin: 0; }
        .period-subtitle { color: #64748b; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;}
        
        .dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
        .dash-card { background: #f8fafc; padding: 25px; border-radius: 14px; border-left: 5px solid #cbd5e1; }
        .dash-card.income { border-left-color: #10b981; }
        .dash-card.expense { border-left-color: #ef4444; }
        .dash-card.net { border-left-color: ${AppState.settings.customColor}; }
        .dash-card h4 { margin: 0; color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;}
        .dash-card p { margin: 10px 0 0 0; font-size: 26px; font-weight: 800; color: #0f172a; }

        h2 { font-size: 22px; color:#0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom:10px; margin-top: 40px;}

        .insight-box { padding: 25px; border-radius: 12px; margin-bottom: 20px; }
        .insight-good { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); }
        .insight-bad { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); }
        .insight-box h3 { margin-top: 0; color: #0f172a; font-size:18px;}
        .insight-box ul { margin: 0; padding-left: 20px; }
        .insight-box li { margin-bottom: 12px; font-size: 15px;}

        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing:1px; }
        tr:nth-child(even) { background: #fbfbfb; }
        .tx-income { color: #10b981; font-weight: 800; }
        .tx-expense { color: #ef4444; font-weight: 800; }
        
        .footer { margin-top: 60px; text-align: center; color: #94a3b8; font-size: 12px; padding-top: 20px; border-top: 1px solid #f1f5f9;}
        .pet-tip { background: #1e293b; color: white; padding: 15px; border-radius: 8px; text-align:center; font-weight: bold; margin-bottom: 30px;}
        @media print { body { padding: 0; } .container { box-shadow: none; border: none; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>Reporte Financiero</h1>
                <div class="period-subtitle">FlexiCuentas App &bull; Análisis Confidencial</div>
            </div>
            <div style="text-align:right;">
                <span class="period-subtitle">Período Seleccionado</span>
                <div style="font-size:20px; font-weight:bold; color:${AppState.settings.customColor};">${periodName}</div>
            </div>
        </div>
        
        <div class="dash-grid">
            <div class="dash-card income">
                <h4>Ingresos Totales</h4>
                <p>+ ${Math.floor(totalIncome).toLocaleString()} ${AppState.settings.baseCurrency}</p>
            </div>
            <div class="dash-card expense">
                <h4>Gastos Totales</h4>
                <p>- ${Math.floor(totalExpense).toLocaleString()} ${AppState.settings.baseCurrency}</p>
            </div>
            <div class="dash-card net">
                <h4>Balance Neto</h4>
                <p>${netSaving >= 0 ? '+' : ''} ${Math.floor(netSaving).toLocaleString()} ${AppState.settings.baseCurrency}</p>
            </div>
        </div>

        <div class="pet-tip">
            🐶 ${petTips[Math.floor(Math.random()*petTips.length)]}
        </div>

        <h2>Inteligencia Financiera (Análisis de IA Local)</h2>
        ${analysisHtml}
        
        <h2>Desglose de Movimientos Registrados</h2>
        <table>
            <thead>
                <tr>
                    <th>Fecha y Hora</th>
                    <th>Registro / Categoría</th>
                    <th>Tipo</th>
                    <th>Impacto Final (${AppState.settings.baseCurrency})</th>
                </tr>
            </thead>
            <tbody>
                ${filteredTxs.length > 0 ? filteredTxs.sort((a,b) => new Date(b.date) - new Date(a.date)).map(t => {
                    const dateStr = new Date(t.date).toLocaleDateString([], {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
                    const valCalc = convertAmount(t.amount, t.currency, AppState.settings.baseCurrency);
                    const isInc = t.type === 'income';
                    return `<tr>
                        <td>${dateStr}</td>
                        <td style="font-weight: ${t.isGoal ? 'bold' : 'normal'}">${t.category} ${t.isGoal ? '🗄️' : ''}</td>
                        <td style="color:#64748b; font-size:12px;">${isInc ? 'Ingreso' : 'Egreso'}</td>
                        <td class="${isInc ? 'tx-income' : 'tx-expense'}">${isInc ? '+' : '-'}${Math.floor(valCalc).toLocaleString()}</td>
                    </tr>`;
                }).join('') : '<tr><td colspan="4" style="text-align:center; padding: 40px; color:#94a3b8;">No hay registros en este período.</td></tr>'}
            </tbody>
        </table>
        
        <div class="footer">
            Generado automáticamente por el motor de análisis de FlexiCuentas en tu dispositivo.<br>
            Tus datos permanecen 100% privados y no son enviados a ningún servidor externo.
        </div>
    </div>
</body>
</html>`;

        const blob = new Blob([htmlDoc], {type: 'text/html'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_Inteligente_${periodName.replace(' ', '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Companion.say("¡Tu reporte premium está listo y descargado! 📄 Ábrelo en tu navegador y verás toda tu analítica interactiva.", 6000);
    }
};

// --- Drag and Drop for Widgets ---
function initDragAndDrop() {
    const dashboardGrid = document.getElementById('dashboard-grid');
    if (!dashboardGrid) return;
    
    // Restore order if saved
    if (AppState.settings.widgetOrder) {
        AppState.settings.widgetOrder.forEach(id => {
            const el = document.getElementById(id);
            if (el) dashboardGrid.appendChild(el);
        });
    }

    const draggables = dashboardGrid.querySelectorAll('.widget[draggable="true"]');
    
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            draggable.classList.add('dragging');
        });

        draggable.addEventListener('dragend', () => {
            draggable.classList.remove('dragging');
            // Save order
            const currentOrder = [...dashboardGrid.querySelectorAll('.widget[draggable="true"]')].map(el => el.id);
            AppState.settings.widgetOrder = currentOrder;
            saveState();
        });
    });

    dashboardGrid.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(dashboardGrid, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (draggable) {
            dashboardGrid.classList.add('drag-over');
            if (afterElement == null) {
                dashboardGrid.appendChild(draggable);
            } else {
                dashboardGrid.insertBefore(draggable, afterElement);
            }
        }
    });

    dashboardGrid.addEventListener('dragleave', e => {
        dashboardGrid.classList.remove('drag-over');
    });

    dashboardGrid.addEventListener('drop', e => {
        dashboardGrid.classList.remove('drag-over');
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.widget[draggable="true"]:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function renderAccounts() {
    const selector = document.getElementById('account-selector');
    if (!selector) return;
    selector.innerHTML = '';
    AppState.accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name;
        if (acc.id === AppState.settings.activeAccountId) opt.selected = true;
        selector.appendChild(opt);
    });
}

function renderApp() {
    const totalBalanceEl = document.getElementById('total-balance');
    const currencySymbolEl = document.querySelector('.currency-symbol');
    
    if(totalBalanceEl) totalBalanceEl.textContent = calculateTotalBalance().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if(currencySymbolEl) currencySymbolEl.textContent = AppState.settings.baseCurrency === 'CRC' ? '₡' : '$';

    const activePet = PetData.find(p => p.id === AppState.settings.activePetId) || PetData[0];
    const petWrapperEl = document.getElementById('active-pet-wrapper');
    if (petWrapperEl) {
        // Inject image if it has imgSrc, else fallback to emoji
        if (activePet.imgSrc) {
            petWrapperEl.innerHTML = `<img src="${activePet.imgSrc}" alt="${activePet.name}" class="pixar-pet-avatar">`;
        } else {
            petWrapperEl.innerHTML = `<div class="emoji-pet-avatar">${activePet.icon}</div>`;
        }
    }

    // Update live rate display in settings
    updateExchangeUI();

    // Apply Global Color dynamically
    document.documentElement.style.setProperty('--accent-primary', AppState.settings.customColor || '#00FFCC');
    
    // Also apply logic for bg and surface if user selected them:
    if (AppState.settings.customBg) {
        document.body.style.setProperty('--bg-color', AppState.settings.customBg);
    }
    if (AppState.settings.customSurface) {
        document.body.style.setProperty('--surface-color', AppState.settings.customSurface);
    }

    if (document.getElementById('btn-setup-pin')) {
        if (AppState.settings.securityPin) {
            document.getElementById('btn-setup-pin').style.display = 'none';
            document.getElementById('btn-remove-pin').style.display = 'block';
        } else {
            document.getElementById('btn-setup-pin').style.display = 'block';
            document.getElementById('btn-remove-pin').style.display = 'none';
        }
    }

    const togglePetCb = document.getElementById('toggle-pet-visibility');
    if (togglePetCb) {
        togglePetCb.checked = !AppState.settings.hidePet;
    }

    const petContainer = document.getElementById('pet-container');
    if (petContainer) {
        petContainer.style.display = AppState.settings.hidePet ? 'none' : 'flex';
    }

    renderAccounts();
    renderDailyFeed();
    renderGoals();
    renderZoo();
    renderHistory();
    renderChart();
}

let expenseChartInstance = null;

function renderChart() {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;
    
    if (typeof Chart === 'undefined') return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Movimientos del mes actual (Mover dinero = Ingresos vs Gastos)
    const monthTxs = AppState.transactions.filter(t => 
        t.accountId === AppState.settings.activeAccountId && 
        new Date(t.date).getMonth() === currentMonth && 
        new Date(t.date).getFullYear() === currentYear &&
        !t.isGoal
    );
    
    let totalIncome = 0;
    let totalExpense = 0;

    monthTxs.forEach(t => {
        const amt = convertAmount(t.amount, t.currency, AppState.settings.baseCurrency);
        if (t.type === 'income') totalIncome += amt;
        else if (t.type === 'expense') totalExpense += amt;
    });

    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    if (totalIncome === 0 && totalExpense === 0) {
        ctx.style.display = 'none';
        const parent = ctx.parentElement;
        if (!parent.querySelector('.no-chart-data')) {
            const noData = document.createElement('div');
            noData.className = 'no-chart-data text-secondary';
            noData.style.textAlign = 'center';
            noData.style.padding = '30px';
            noData.innerHTML = '<span style="font-size:30px;">⚖️</span><br>Aún no hay movimientos en este mes.';
            parent.appendChild(noData);
        }
        return;
    } else {
        ctx.style.display = 'block';
        const noDataEl = ctx.parentElement.querySelector('.no-chart-data');
        if (noDataEl) noDataEl.remove();
    }

    const chartType = AppState.settings.chartType || 'bar';

    const primaryColor = AppState.settings.customColor || '#00FFCC';
    const expenseColor = 'rgba(255, 94, 137, 1)'; // #FF5E89 Premium Pink/Red

    // Gradiente para Ingresos
    const gradientInc = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradientInc.addColorStop(0, primaryColor);
    gradientInc.addColorStop(1, 'rgba(0,0,0,0.1)');

    // Gradiente para Gastos
    const gradientExp = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradientExp.addColorStop(0, expenseColor);
    gradientExp.addColorStop(1, 'rgba(0,0,0,0.1)');

    Chart.defaults.color = 'rgba(255,255,255,0.6)';
    Chart.defaults.font.family = 'Outfit';

    const commonData = {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{
            label: 'Monto Total',
            data: [totalIncome, totalExpense],
            backgroundColor: [gradientInc, gradientExp],
            borderColor: [primaryColor, expenseColor],
            borderWidth: chartType === 'bar' ? 1 : 2,
            borderRadius: chartType === 'bar' ? 12 : 15,
            spacing: chartType === 'doughnut' ? 10 : 0,
            barThickness: 50,
            borderSkipped: false,
            hoverOffset: chartType === 'doughnut' ? 10 : 0
        }]
    };

    let chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                display: chartType === 'doughnut',
                position: 'right',
                labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true, padding: 15, font: { size: 14, weight: '600', family: 'Outfit' } }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { size: 14, family: 'Outfit', weight: 'bold' },
                bodyFont: { size: 16, weight: 'bold', family: 'Outfit' },
                padding: 15,
                cornerRadius: 15,
                callbacks: {
                    label: function(context) {
                        const val = chartType === 'bar' ? context.parsed.y : context.parsed;
                        return ' ' + Math.floor(val).toLocaleString('en-US') + ' ' + (AppState.settings.baseCurrency === 'CRC' ? '₡' : '$');
                    }
                }
            }
        }
    };

    if (chartType === 'bar') {
        chartOptions.scales = {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5] },
                ticks: {
                    callback: function(value) {
                        if (value >= 1000) return (value / 1000) + 'k';
                        return value;
                    }
                }
            },
            x: {
                grid: { display: false },
                ticks: { font: { weight: 'bold', size: 15, color: '#fff' } }
            }
        };
    } else {
        chartOptions.cutout = '80%';
    }

    // Plugin avanzado para Glow de Neon en gráficas
    const neonGlowPlugin = {
        id: 'neonGlow',
        beforeDatasetsDraw: (chart) => {
            if (chartType === 'doughnut') {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 10;
            }
        },
        afterDatasetsDraw: (chart) => {
            if (chartType === 'doughnut') {
                chart.ctx.restore();
            }
        }
    };

    expenseChartInstance = new Chart(ctx, {
        type: chartType,
        data: commonData,
        options: chartOptions,
        plugins: [neonGlowPlugin]
    });
}

window.toggleChartType = function() {
    AppState.settings.chartType = AppState.settings.chartType === 'bar' ? 'doughnut' : 'bar';
    saveState();
    renderChart();
};

document.addEventListener('DOMContentLoaded', () => {
    // Global PIN logic
    window.currentPinInput = '';
    window.pinSetupStep = 0; // 0=auth, 1=new, 2=confirm
    window.tempPinSetup = '';

    window.updatePinDots = function() {
        const dots = document.querySelectorAll('#lock-dots .dot');
        dots.forEach((dot, idx) => {
            if (idx < window.currentPinInput.length) dot.classList.add('filled');
            else dot.classList.remove('filled');
        });
    }

    window.resetPinInput = function(shake = false) {
        const dotsContainer = document.getElementById('lock-dots');
        if (shake) {
            dotsContainer.classList.remove('shake');
            void dotsContainer.offsetWidth; // reflow
            dotsContainer.classList.add('shake');
        }
        window.currentPinInput = '';
        setTimeout(window.updatePinDots, shake ? 400 : 0);
    }

    window.checkPin = function() {
        if (window.pinSetupStep === 0) {
            if (window.currentPinInput === AppState.settings.securityPin) {
                const lockScreen = document.getElementById('lock-screen');
                lockScreen.style.opacity = '0';
                setTimeout(() => {
                    lockScreen.style.display = 'none';
                    Companion.init();
                }, 400);
            } else {
                window.resetPinInput(true);
            }
        } else if (window.pinSetupStep === 1) {
            window.tempPinSetup = window.currentPinInput;
            document.getElementById('lock-title').textContent = 'Repite tu nuevo PIN';
            window.pinSetupStep = 2;
            window.resetPinInput();
        } else if (window.pinSetupStep === 2) {
            if (window.currentPinInput === window.tempPinSetup) {
                AppState.settings.securityPin = window.tempPinSetup;
                saveState();
                document.getElementById('lock-screen').style.display = 'none';
                document.getElementById('btn-setup-pin').style.display = 'none';
                document.getElementById('btn-remove-pin').style.display = 'block';
                Companion.say('¡PIN de seguridad activado con éxito! 🔒', 4000);
                window.pinSetupStep = 0;
            } else {
                alert('Los códigos no coinciden. Inténtalo de nuevo.');
                document.getElementById('lock-title').textContent = 'Crea tu nuevo PIN (4 dígitos)';
                window.pinSetupStep = 1;
                window.resetPinInput(true);
            }
        }
    }

    window.pressPin = function(key) {
        if (key === 'back') {
            window.currentPinInput = window.currentPinInput.slice(0, -1);
        } else {
            if (window.currentPinInput.length < 4) window.currentPinInput += key;
        }
        window.updatePinDots();
        if (window.currentPinInput.length === 4) {
            setTimeout(window.checkPin, 100);
        }
    }

    window.setupPIN = function() {
        document.getElementById('settings-modal').classList.remove('active');
        const lockScreen = document.getElementById('lock-screen');
        lockScreen.style.display = 'flex';
        lockScreen.style.opacity = '1';
        document.getElementById('lock-title').textContent = 'Crea tu nuevo PIN (4 dígitos)';
        document.getElementById('btn-cancel-pin').style.display = 'block';
        window.pinSetupStep = 1;
        window.currentPinInput = '';
        window.tempPinSetup = '';
        window.updatePinDots();
    }

    window.cancelPinSetup = function() {
        document.getElementById('lock-screen').style.display = 'none';
        window.pinSetupStep = 0;
    }

    window.removePIN = function() {
        const entered = prompt("Por seguridad, ingresa tu PIN actual para desactivarlo:");
        if (entered === AppState.settings.securityPin) {
            AppState.settings.securityPin = null;
            saveState();
            document.getElementById('btn-setup-pin').style.display = 'block';
            document.getElementById('btn-remove-pin').style.display = 'none';
            Companion.say("Bloqueo de seguridad desactivado. 🔓", 3000);
        } else if (entered !== null) {
            alert("El PIN ingresado es incorrecto.");
        }
    }

    function startApp() {
        if (AppState.settings.securityPin) {
            const lockScreen = document.getElementById('lock-screen');
            lockScreen.style.display = 'flex';
            lockScreen.style.opacity = '1';
            document.getElementById('lock-title').textContent = 'Ingresa tu PIN';
            document.getElementById('btn-cancel-pin').style.display = 'none';
            window.pinSetupStep = 0;
            window.currentPinInput = '';
            window.updatePinDots();
        } else {
            Companion.init();
        }
        fetchLiveExchangeRate();
    }

    // Splash Screen Logic
    const splashScreen = document.getElementById('splash-screen');
    if(splashScreen) {
        setTimeout(() => {
            splashScreen.classList.remove('splash-active');
            startApp();
        }, 1500);
    } else {
        startApp();
    }

    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const appViews = document.querySelectorAll('.app-view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            appViews.forEach(view => view.classList.remove('active-view'));
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active-view');
        });
    });

    // Settings Base Currency Selector
    const sbc = document.getElementById('settings-base-currency');
    if (sbc) {
        sbc.value = AppState.settings.baseCurrency || 'CRC';
        sbc.addEventListener('change', (e) => {
            AppState.settings.baseCurrency = e.target.value;
            saveState();
            renderApp();
        });
    }

    // Pet Visibility Toggle
    const togglePetCb = document.getElementById('toggle-pet-visibility');
    if (togglePetCb) {
        togglePetCb.addEventListener('change', (e) => {
            AppState.settings.hidePet = !e.target.checked;
            saveState();
            renderApp();
        });
    }

    // Color Pickers Logic
    const colorAccent = document.getElementById('color-accent');
    const colorBg = document.getElementById('color-bg');
    const colorSurface = document.getElementById('color-surface');
    const btnResetColors = document.getElementById('btn-reset-colors');

    if (colorAccent) {
        colorAccent.value = AppState.settings.customColor || '#00FFCC';
        colorAccent.addEventListener('input', (e) => {
            AppState.settings.customColor = e.target.value;
            saveState(); 
        });
    }

    if (colorBg) {
        colorBg.value = AppState.settings.customBg || '#0F172A';
        colorBg.addEventListener('input', (e) => {
            AppState.settings.customBg = e.target.value;
            saveState(); 
        });
    }

    if (colorSurface) {
        colorSurface.value = AppState.settings.customSurface || '#1E293B';
        colorSurface.addEventListener('input', (e) => {
            AppState.settings.customSurface = e.target.value;
            saveState(); 
        });
    }

    if (btnResetColors) {
        btnResetColors.addEventListener('click', () => {
            AppState.settings.customColor = '#00FFCC';
            AppState.settings.customBg = '#0F172A';
            AppState.settings.customSurface = '#1E293B';
            
            if (colorAccent) colorAccent.value = '#00FFCC';
            if (colorBg) colorBg.value = '#0F172A';
            if (colorSurface) colorSurface.value = '#1E293B';
            
            saveState();
        });
    }

    // Modal Logic
    const modal = document.getElementById('transaction-modal');
    const btnAddIncome = document.getElementById('btn-add-income');
    const btnAddExpense = document.getElementById('btn-add-expense');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnSubmitTx = document.getElementById('btn-submit-tx');
    const modalTitle = document.getElementById('modal-title');
    const txTypeInput = document.getElementById('tx-type');

    function openModal(type) {
        txTypeInput.value = type;
        if (type === 'income') {
            modalTitle.textContent = 'Nuevo Ingreso';
            btnSubmitTx.className = 'btn-action btn-income';
        } else {
            modalTitle.textContent = 'Nuevo Gasto';
            btnSubmitTx.className = 'btn-action btn-expense';
        }
        modal.classList.add('active');
        document.getElementById('tx-amount').focus();
    }

    if(btnAddIncome) btnAddIncome.addEventListener('click', () => openModal('income'));
    if(btnAddExpense) btnAddExpense.addEventListener('click', () => openModal('expense'));
    if(btnCloseModal) btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));

    if(btnSubmitTx) btnSubmitTx.addEventListener('click', () => {
        const amount = document.getElementById('tx-amount').value;
        const currency = document.getElementById('tx-currency').value;
        const category = document.getElementById('tx-category').value || 'General';
        const type = document.getElementById('tx-type').value;

        if (amount && !isNaN(amount) && Number(amount) > 0) {
            addTransaction(type, amount, currency, category);
            modal.classList.remove('active');
            document.getElementById('tx-amount').value = '';
            document.getElementById('tx-category').value = '';
        } else {
            alert('Por favor, ingresa un monto válido.');
        }
    });

    // Edit Tx Logic
    const editTxModal = document.getElementById('edit-tx-modal');
    const btnSubmitEditTx = document.getElementById('btn-submit-edit-tx');
    const btnDeleteTx = document.getElementById('btn-delete-tx');
    const btnCloseEditTxModal = document.getElementById('btn-close-edit-tx-modal');

    if (btnCloseEditTxModal) btnCloseEditTxModal.addEventListener('click', () => {
        editTxModal.classList.remove('active');
    });

    if (btnSubmitEditTx) btnSubmitEditTx.addEventListener('click', () => {
        const txId = document.getElementById('edit-tx-id').value;
        const amount = document.getElementById('edit-tx-amount').value;
        const currency = document.getElementById('edit-tx-currency').value;
        const category = document.getElementById('edit-tx-category').value || 'General';

        if (amount && !isNaN(amount) && Number(amount) > 0) {
            const tx = AppState.transactions.find(t => t.id === txId);
            if (tx) {
                syncGoalFromTxEdit(tx, parseFloat(amount), false);
                tx.amount = parseFloat(amount);
                tx.currency = currency;
                tx.category = category;
                saveState();
            }
            editTxModal.classList.remove('active');
        } else {
            alert('Por favor, ingresa un monto válido.');
        }
    });

    if (btnDeleteTx) btnDeleteTx.addEventListener('click', () => {
        const txId = document.getElementById('edit-tx-id').value;
        if (confirm('¿Estás seguro de que deseas eliminar este movimiento?')) {
            const tx = AppState.transactions.find(t => t.id === txId);
            if (tx) {
                syncGoalFromTxEdit(tx, 0, true);
                AppState.transactions = AppState.transactions.filter(t => t.id !== txId);
                saveState();
            }
            editTxModal.classList.remove('active');
        }
    });

    // Goal Modal Logic
    const goalModal = document.getElementById('goal-modal');
    const btnAddGoal = document.getElementById('btn-add-goal');
    if(btnAddGoal) btnAddGoal.addEventListener('click', () => {
        goalModal.classList.add('active');
        document.getElementById('goal-title').focus();
    });
    
    const btnCloseGoalModal = document.getElementById('btn-close-goal-modal');
    if(btnCloseGoalModal) btnCloseGoalModal.addEventListener('click', () => {
        goalModal.classList.remove('active');
    });

    const btnSubmitGoal = document.getElementById('btn-submit-goal');
    if(btnSubmitGoal) btnSubmitGoal.addEventListener('click', () => {
        const title = document.getElementById('goal-title').value;
        const amount = document.getElementById('goal-amount').value;
        const currency = document.getElementById('goal-currency').value;
        const date = document.getElementById('goal-date').value;

        if (title && amount && date && Number(amount) > 0) {
            AppState.goals.push({
                id: Date.now().toString(),
                title,
                totalAmount: parseFloat(amount),
                currency,
                targetDate: date,
                savedAmount: 0
            });
            saveState();
            goalModal.classList.remove('active');
            document.getElementById('goal-title').value = '';
            document.getElementById('goal-amount').value = '';
            document.getElementById('goal-date').value = '';
            
            Companion.cinematicCelebration();
        } else {
            alert('Por favor, completa todos los campos de la meta correctamente.');
        }
    });

    // Goal Deposit Logic
    const btnSubmitDeposit = document.getElementById('btn-submit-deposit');
    if (btnSubmitDeposit) btnSubmitDeposit.addEventListener('click', () => {
        const goalId = document.getElementById('deposit-goal-id').value;
        const amount = document.getElementById('deposit-goal-amount').value;
        const accountId = document.getElementById('deposit-goal-account').value;
        
        if (amount && !isNaN(amount) && Number(amount) > 0) {
            const goal = AppState.goals.find(g => g.id === goalId);
            if (goal) {
                goal.savedAmount += parseFloat(amount);
                // Ensure saving records are marked as isGoal = true
                addTransaction('expense', amount, goal.currency, `Ahorro: ${goal.title}`, true, accountId); 
                
                saveState();
                document.getElementById('deposit-goal-modal').classList.remove('active');
                
                if (goal.savedAmount >= goal.totalAmount) {
                    Companion.grandGoalCelebration(goal);
                } else {
                    Companion.cinematicCelebration();
                }
            }
        } else {
            alert('Por favor, ingresa un monto válido.');
        }
    });

    const btnCloseDeposit = document.getElementById('btn-close-deposit-modal');
    if (btnCloseDeposit) btnCloseDeposit.addEventListener('click', () => {
        document.getElementById('deposit-goal-modal').classList.remove('active');
    });

    // Goal Release Logic
    const btnSubmitRelease = document.getElementById('btn-submit-release');
    if (btnSubmitRelease) btnSubmitRelease.addEventListener('click', () => {
        const goalId = document.getElementById('release-goal-id').value;
        const accountId = document.getElementById('release-goal-account').value;
        
        const goal = AppState.goals.find(g => g.id === goalId);
        if (goal) {
            goal.isReleased = true;
            // Income for the target account
            addTransaction('income', goal.savedAmount, goal.currency, `Liberación de Meta: ${goal.title}`, true, accountId);
            saveState();
            document.getElementById('release-goal-modal').classList.remove('active');
            Companion.say('¡Fondos liberados con éxito a la cuenta seleccionada! 🎉', 5000);
            Companion.cinematicCelebration();
        }
    });

    const btnCloseRelease = document.getElementById('btn-close-release-modal');
    if (btnCloseRelease) btnCloseRelease.addEventListener('click', () => {
        document.getElementById('release-goal-modal').classList.remove('active');
    });

    // Account Selector & Modal Logic
    const accountSelector = document.getElementById('account-selector');
    if (accountSelector) {
        accountSelector.addEventListener('change', (e) => {
            AppState.settings.activeAccountId = e.target.value;
            saveState(); // Will call renderApp and update everything
        });
    }

    const accountModal = document.getElementById('account-modal');
    const btnAddAccount = document.getElementById('btn-add-account');
    const btnCloseAccountModal = document.getElementById('btn-close-account-modal');
    const btnSubmitAccount = document.getElementById('btn-submit-account');

    if (btnAddAccount) btnAddAccount.addEventListener('click', () => {
        accountModal.classList.add('active');
        document.getElementById('account-name-input').focus();
    });

    if (btnCloseAccountModal) btnCloseAccountModal.addEventListener('click', () => {
        accountModal.classList.remove('active');
    });

    if (btnSubmitAccount) btnSubmitAccount.addEventListener('click', () => {
        const nameInput = document.getElementById('account-name-input');
        const name = nameInput.value.trim();
        if (name) {
            const newAccId = 'acc_' + Date.now();
            AppState.accounts.push({ id: newAccId, name: name });
            AppState.settings.activeAccountId = newAccId;
            saveState();
            accountModal.classList.remove('active');
            nameInput.value = '';
        } else {
            alert('Por favor, ingresa un nombre para la cuenta.');
        }
    });

    // Edit Account Logic
    const editAccountModal = document.getElementById('edit-account-modal');
    const btnEditAccount = document.getElementById('btn-edit-account');
    const btnCloseEditAccountModal = document.getElementById('btn-close-edit-account-modal');
    const btnSubmitEditAccount = document.getElementById('btn-submit-edit-account');
    const btnDeleteAccount = document.getElementById('btn-delete-account');

    if (btnEditAccount) btnEditAccount.addEventListener('click', () => {
        const currentAcc = AppState.accounts.find(a => a.id === AppState.settings.activeAccountId);
        if (currentAcc) {
            document.getElementById('edit-account-name-input').value = currentAcc.name;
            editAccountModal.classList.add('active');
            setTimeout(() => document.getElementById('edit-account-name-input').focus(), 100);
        }
    });

    if (btnCloseEditAccountModal) btnCloseEditAccountModal.addEventListener('click', () => {
        editAccountModal.classList.remove('active');
    });

    if (btnSubmitEditAccount) btnSubmitEditAccount.addEventListener('click', () => {
        const newName = document.getElementById('edit-account-name-input').value.trim();
        if (newName) {
            const currentAcc = AppState.accounts.find(a => a.id === AppState.settings.activeAccountId);
            if (currentAcc) currentAcc.name = newName;
            saveState();
            editAccountModal.classList.remove('active');
        } else {
            alert('Por favor, ingresa un nombre válido para la cuenta.');
        }
    });

    if (btnDeleteAccount) btnDeleteAccount.addEventListener('click', () => {
        if (AppState.accounts.length <= 1) {
            alert('Esta es tu única cuenta. Si deseas otro nombre, simplemente edítalo.');
            return;
        }
        
        if (confirm('¿Estás seguro de que deseas eliminar esta cuenta? ADVERTENCIA: Se borrarán permanentemente todos los movimientos registrados en ella.')) {
            // Delete transactions of this account
            AppState.transactions = AppState.transactions.filter(t => t.accountId !== AppState.settings.activeAccountId);
            // Delete account itself
            AppState.accounts = AppState.accounts.filter(a => a.id !== AppState.settings.activeAccountId);
            // Switch active account
            AppState.settings.activeAccountId = AppState.accounts[0].id;
            
            saveState();
            editAccountModal.classList.remove('active');
        }
    });

    const btnGenerateReport = document.getElementById('btn-generate-report');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', () => {
            ReportGenerator.generateAndDownload();
        });
    }

    renderApp();
    initDragAndDrop();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .catch(err => console.log('SW Failed', err));
        });
    }
});
