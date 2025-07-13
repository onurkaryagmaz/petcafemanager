document.addEventListener('DOMContentLoaded', () => {
    // --- TELEGRAM SDK INITIALIZATION ---
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();

    // --- DOM ELEMENTS ---
    const goldValueEl = document.getElementById('gold-value');
    const tokenValueEl = document.getElementById('token-value');
    const appealValueEl = document.getElementById('appeal-value');
    const gridEl = document.getElementById('cafe-grid');
    const floatingTextContainer = document.getElementById('floating-text-container');
    const modalBackdrop = document.getElementById('modal-backdrop');

    // Modals
    const buildModal = document.getElementById('build-modal');
    const cookbookModal = document.getElementById('cookbook-modal');
    const shopModal = document.getElementById('shop-modal');
    const messageModal = document.getElementById('message-modal');

    // Action Buttons
    document.getElementById('build-btn').addEventListener('click', openBuildModal);
    document.getElementById('cookbook-btn').addEventListener('click', openCookbookModal);
    document.getElementById('shop-btn').addEventListener('click', openShopModal);
    
    // --- GAME DATA DEFINITIONS ---
    const customersData = {
        badger: { id: 'badger', name: 'Badger', sprite: '🦡', minAppealRequired: 0, possibleOrders: ['fish_tea'] },
        fox: { id: 'fox', name: 'Fox', sprite: '🦊', minAppealRequired: 10, possibleOrders: ['fish_tea', 'berry_pie'] },
        owl: { id: 'owl', name: 'Owl', sprite: '🦉', minAppealRequired: 25, possibleOrders: ['berry_pie'] },
    };

    const recipesData = {
        fish_tea: { id: 'fish_tea', name: 'Fish Tea', sprite: '🍵', equipmentNeeded: 'blender', cookingTime: 10, price: 5 },
        berry_pie: { id: 'berry_pie', name: 'Berry Pie', sprite: '🥧', equipmentNeeded: 'oven', cookingTime: 20, price: 15 },
    };

    const furnitureData = {
        wooden_stool: { id: 'wooden_stool', name: 'Wooden Stool', sprite: '🪵', type: 'chair', cost: { gold: 10 }, appeal: 1 },
        comfy_armchair: { id: 'comfy_armchair', name: 'Comfy Armchair', sprite: '🛋️', type: 'chair', cost: { gold: 50 }, appeal: 5 },
        potted_plant: { id: 'potted_plant', name: 'Potted Plant', sprite: '🪴', type: 'decoration', cost: { gold: 25 }, appeal: 3 },
        enchanted_set: { id: 'enchanted_set', name: 'Enchanted Set', sprite: '🍄', type: 'decoration', cost: { tokens: 5 }, appeal: 50, isPremium: true },
    };

    const equipmentData = {
        basic_blender: { id: 'basic_blender', name: 'Basic Blender', sprite: '🔪', type: 'blender', cost: { gold: 100 }, appeal: 2 },
        industrial_oven: { id: 'industrial_oven', name: 'Industrial Oven', sprite: '🔥', type: 'oven', cost: { gold: 250 }, appeal: 5 },
    };

    const iapData = {
        token_pack_1: { id: 'token_pack_1', name: '5 Gourmet Tokens', cost: 10, provides: { tokens: 5 } },
        token_pack_2: { id: 'token_pack_2', name: '25 Gourmet Tokens', cost: 45, provides: { tokens: 25 } },
    };


    // --- GAME STATE ---
    let gameState = {};
    const GRID_SIZE = 10;
    
    const defaultGameState = {
        resources: { gold: 50, tokens: 0 },
        cafeAppeal: 0,
        cafeLayout: {}, // 'x,y': { itemId, type: 'furniture'/'equipment' }
        unlockedRecipes: ['fish_tea'],
        ownedFurniture: [],
        ownedEquipment: [],
        activeCustomers: {}, // 'x,y' of chair: { customerId, orderId, patience, startTime }
        activeOrders: {}, // 'x,y' of equipment: { orderId, startTime, totalTime }
        boosts: {
            rushHour: { active: false, endTime: 0 }
        }
    };

    // --- GAME LOGIC VARIABLES ---
    let isBuildMode = false;
    let buildItemId = null;
    let buildItemType = null;


    // --- INITIALIZATION ---
    function initGame() {
        loadGame().then(() => {
            renderCafe();
            updateResourceBar();
            calculateAppeal();
            setInterval(gameLoop, 1000); // Main game loop runs every second
            console.log("Game Initialized and Loaded.");
        });
    }

    // --- GAME LOOP ---
    function gameLoop() {
        const now = Date.now();
        updateCustomerPatience(now);
        updateCookingProgress(now);
        checkForRushHourEnd(now);
        spawnCustomer();
        // The game state is saved frequently to avoid data loss
        saveGame();
    }
    
    // --- DATA PERSISTENCE (TELEGRAM CLOUD STORAGE) ---
    function saveGame() {
        tg.CloudStorage.setItem('petCafeGameState', JSON.stringify(gameState), (error, success) => {
            if (error) {
                console.error('Error saving game state:', error);
            }
        });
    }

    async function loadGame() {
        return new Promise(resolve => {
            tg.CloudStorage.getItem('petCafeGameState', (error, value) => {
                if (error) {
                    console.error('Error loading game state:', error);
                    gameState = JSON.parse(JSON.stringify(defaultGameState)); // Deep copy
                } else if (value) {
                    try {
                        gameState = JSON.parse(value);
                        // Data migration: if new properties added to default state, merge them in
                        gameState = {...JSON.parse(JSON.stringify(defaultGameState)), ...gameState};
                    } catch (e) {
                        console.error("Failed to parse saved data, starting new game.", e);
                        gameState = JSON.parse(JSON.stringify(defaultGameState));
                    }
                } else {
                    console.log("No saved data found, starting new game.");
                    gameState = JSON.parse(JSON.stringify(defaultGameState));
                }
                resolve();
            });
        });
    }


    // --- UI RENDERING ---
    function updateResourceBar() {
        goldValueEl.textContent = gameState.resources.gold;
        tokenValueEl.textContent = gameState.resources.tokens;
        appealValueEl.textContent = gameState.cafeAppeal;
    }

    function renderCafe() {
        gridEl.innerHTML = '';
        gridEl.classList.toggle('build-mode', isBuildMode);

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.x = x;
                cell.dataset.y = y;
                const coord = `${x},${y}`;

                const placedObject = gameState.cafeLayout[coord];
                if (placedObject) {
                    const data = placedObject.type === 'furniture' ? furnitureData[placedObject.itemId] : equipmentData[placedObject.itemId];
                    cell.innerHTML = `<div class="game-object" title="${data.name}">${data.sprite}</div>`;
                    cell.classList.add('occupied');
                    cell.onclick = () => onGridObjectClick(coord);
                    
                    // Render customer if seated
                    const customer = gameState.activeCustomers[coord];
                    if (customer) {
                        renderCustomer(cell, customer);
                    }

                    // Render cooking progress
                    const order = gameState.activeOrders[coord];
                    if(order) {
                        renderCookingProgress(cell, order);
                    }

                } else if (isBuildMode) {
                     cell.onclick = () => onEmptyCellClick(coord);
                }
                
                gridEl.appendChild(cell);
            }
        }
    }
    
    function renderCustomer(cell, customer) {
        const customerData = customersData[customer.customerId];
        const orderData = recipesData[customer.orderId];
        const customerEl = cell.querySelector('.game-object');
        
        // Add customer sprite next to chair
        const customerSprite = document.createElement('span');
        customerSprite.textContent = customerData.sprite;
        customerSprite.style.marginLeft = '5px';
        customerEl.appendChild(customerSprite);
        
        // Order bubble
        const bubble = document.createElement('div');
        bubble.classList.add('customer-bubble');
        bubble.textContent = orderData.sprite;
        bubble.onclick = (e) => {
            e.stopPropagation();
            startOrder(customer.orderId, coord);
        }
        customerEl.appendChild(bubble);

        // Patience bar
        const patienceBar = document.createElement('div');
        patienceBar.classList.add('patience-bar');
        patienceBar.innerHTML = `<div class="patience-bar-inner" style="width: ${customer.patience}%"></div>`;
        customerEl.appendChild(patienceBar);
    }

    function renderCookingProgress(cell, order) {
        const orderData = recipesData[order.orderId];
        const equipmentEl = cell.querySelector('.game-object');

        const now = Date.now();
        const elapsedTime = (now - order.startTime) / 1000;
        const progress = Math.min(100, (elapsedTime / order.totalTime) * 100);

        let progressBar = equipmentEl.querySelector('.progress-bar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.classList.add('progress-bar');
            progressBar.innerHTML = `<div class="progress-bar-inner"></div>`;
            equipmentEl.appendChild(progressBar);
        }
        
        const innerBar = progressBar.querySelector('.progress-bar-inner');
        innerBar.style.width = `${progress}%`;

        if (progress >= 100) {
            equipmentEl.classList.add('ready-indicator');
            equipmentEl.innerHTML += orderData.sprite;
        }
    }
    
    function showFloatingText(text, x, y) {
        const textEl = document.createElement('div');
        textEl.className = 'floating-text';
        textEl.textContent = text;
        
        // Position relative to grid container
        const gridRect = gridEl.getBoundingClientRect();
        const cellWidth = gridRect.width / GRID_SIZE;
        const cellHeight = gridRect.height / GRID_SIZE;
        
        textEl.style.left = `${x * cellWidth + cellWidth / 2}px`;
        textEl.style.top = `${y * cellHeight}px`;

        floatingTextContainer.appendChild(textEl);
        setTimeout(() => textEl.remove(), 1500);
    }

    // --- GAME MECHANICS ---
    function calculateAppeal() {
        let totalAppeal = 0;
        Object.values(gameState.cafeLayout).forEach(item => {
            const data = item.type === 'furniture' ? furnitureData[item.itemId] : equipmentData[item.itemId];
            if (data) {
                totalAppeal += data.appeal;
            }
        });
        gameState.cafeAppeal = totalAppeal;
        updateResourceBar();
    }

    function spawnCustomer() {
        const availableChairs = Object.keys(gameState.cafeLayout).filter(coord => {
            const item = gameState.cafeLayout[coord];
            const data = furnitureData[item.itemId];
            return data && data.type === 'chair' && !gameState.activeCustomers[coord];
        });

        if (availableChairs.length === 0) return;

        // Simple spawn logic: 20% chance per second if chairs are free
        if (Math.random() > 0.8) {
            const eligibleCustomers = Object.values(customersData).filter(c => gameState.cafeAppeal >= c.minAppealRequired);
            if (eligibleCustomers.length === 0) return;

            const customer = eligibleCustomers[Math.floor(Math.random() * eligibleCustomers.length)];
            const orderId = customer.possibleOrders[Math.floor(Math.random() * customer.possibleOrders.length)];
            const chairCoord = availableChairs[Math.floor(Math.random() * availableChairs.length)];

            if (gameState.unlockedRecipes.includes(orderId)) {
                gameState.activeCustomers[chairCoord] = {
                    customerId: customer.id,
                    orderId: orderId,
                    patience: 100,
                    startTime: Date.now()
                };
                console.log(`${customer.name} arrived and wants ${recipesData[orderId].name}`);
                renderCafe();
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    }
    
    function updateCustomerPatience(now) {
        let needsRender = false;
        Object.keys(gameState.activeCustomers).forEach(coord => {
            const customer = gameState.activeCustomers[coord];
            // Simple patience logic: lose 100% over 60 seconds
            const elapsedTime = (now - customer.startTime) / 1000;
            customer.patience = Math.max(0, 100 - (elapsedTime / 60) * 100);

            if (customer.patience <= 0) {
                console.log(`${customersData[customer.customerId].name} left angrily.`);
                delete gameState.activeCustomers[coord];
                // Apply small temporary penalty (optional)
                tg.HapticFeedback.notificationOccurred('error');
                needsRender = true;
            }
        });
        if(needsRender) renderCafe();
    }

    function updateCookingProgress(now) {
        let needsRender = false;
        Object.keys(gameState.activeOrders).forEach(coord => {
             const order = gameState.activeOrders[coord];
             const elapsedTime = (now - order.startTime) / 1000;
             if (elapsedTime >= order.totalTime) {
                if(!gameState.activeOrders[coord].isReady) {
                   gameState.activeOrders[coord].isReady = true;
                   needsRender = true;
                }
             }
        });
        if(needsRender) renderCafe();
    }


    function startOrder(orderId, customerChairCoord) {
        tg.HapticFeedback.impactOccurred('light');
        const recipe = recipesData[orderId];
        const neededEquipmentType = recipe.equipmentNeeded;

        const freeEquipment = Object.keys(gameState.cafeLayout).find(coord => {
            const item = gameState.cafeLayout[coord];
            const data = equipmentData[item.itemId];
            return data && data.type === neededEquipmentType && !gameState.activeOrders[coord];
        });

        if (freeEquipment) {
            // Assign order to customer
            gameState.activeCustomers[customerChairCoord].assignedEquipment = freeEquipment;
            
            // Start cooking
            gameState.activeOrders[freeEquipment] = {
                orderId: orderId,
                customerChairCoord: customerChairCoord,
                startTime: Date.now(),
                totalTime: recipe.cookingTime,
                isReady: false
            };
            console.log(`Started cooking ${recipe.name} on ${equipmentData[gameState.cafeLayout[freeEquipment].itemId].name}`);
            renderCafe();
        } else {
            showMessage("No free equipment!", `A ${neededEquipmentType} is required to make ${recipe.name}.`);
        }
    }

    function collectEarnings(equipmentCoord) {
        tg.HapticFeedback.impactOccurred('medium');
        const order = gameState.activeOrders[equipmentCoord];
        if (!order || !order.isReady) return;

        const recipe = recipesData[order.orderId];
        const customer = gameState.activeCustomers[order.customerChairCoord];
        const [x,y] = order.customerChairCoord.split(',').map(Number);
        
        if (customer) {
            let earnings = recipe.price;
            if(gameState.boosts.rushHour.active) {
                earnings *= 2;
                showFloatingText(`+${earnings} 🪙 (x2)`, x, y);
            } else {
                showFloatingText(`+${earnings} 🪙`, x, y);
            }

            gameState.resources.gold += earnings;
            
            delete gameState.activeCustomers[order.customerChairCoord];
            delete gameState.activeOrders[equipmentCoord];

            updateResourceBar();
            renderCafe();
            console.log(`Served ${recipe.name} and earned ${earnings} gold.`);
        }
    }

    // --- BUILD MODE ---
    function enterBuildMode(itemId, type) {
        isBuildMode = true;
        buildItemId = itemId;
        buildItemType = type;
        closeAllModals();
        renderCafe();
    }
    
    function exitBuildMode() {
        isBuildMode = false;
        buildItemId = null;
        buildItemType = null;
        renderCafe();
    }
    
    function onEmptyCellClick(coord) {
        if (!isBuildMode) return;
        tg.HapticFeedback.impactOccurred('light');

        const itemData = buildItemType === 'furniture' ? furnitureData[buildItemId] : equipmentData[buildItemId];
        
        // Deduct cost
        if (itemData.cost.gold && gameState.resources.gold >= itemData.cost.gold) {
            gameState.resources.gold -= itemData.cost.gold;
        } else if (itemData.cost.tokens && gameState.resources.tokens >= itemData.cost.tokens) {
            gameState.resources.tokens -= itemData.cost.tokens;
        } else {
            showMessage("Not enough resources!", `You cannot afford a ${itemData.name}.`);
            exitBuildMode();
            return;
        }
        
        // Place item
        gameState.cafeLayout[coord] = { itemId: buildItemId, type: buildItemType };

        // Add to owned list
        if (buildItemType === 'furniture') {
            gameState.ownedFurniture.push(buildItemId);
        } else {
            gameState.ownedEquipment.push(buildItemId);
        }

        calculateAppeal();
        updateResourceBar();
        exitBuildMode();
    }

    function onGridObjectClick(coord) {
        if (isBuildMode) {
             showMessage("Placement failed", "This spot is already occupied.");
             exitBuildMode();
             return;
        }

        // Check if it's a ready order
        const order = gameState.activeOrders[coord];
        if (order && order.isReady) {
            collectEarnings(coord);
        }
    }


    // --- MODAL CONTROLS ---
    function openModal(modal) {
        modalBackdrop.classList.remove('hidden');
        modal.classList.remove('hidden');
        tg.HapticFeedback.impactOccurred('soft');
    }

    function closeAllModals() {
        modalBackdrop.classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        if (isBuildMode) {
            exitBuildMode();
        }
    }
    
    function showMessage(title, text) {
        document.getElementById('message-title').textContent = title;
        document.getElementById('message-text').textContent = text;
        openModal(messageModal);
    }
    
    // --- SPECIFIC MODAL POPULATORS ---
    function openBuildModal() {
        // Furniture Tab
        const furnitureTab = document.getElementById('furniture-tab');
        furnitureTab.innerHTML = '';
        Object.values(furnitureData).forEach(item => {
            // Do not show premium items that need tokens here
            if (item.isPremium) return;
            const canAfford = gameState.resources.gold >= item.cost.gold;
            const itemEl = document.createElement('div');
            itemEl.className = 'shop-item';
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>${item.sprite} ${item.name}</h4>
                    <p>Appeal: ❤️+${item.appeal}</p>
                </div>
                <button class="build-item-btn ${canAfford ? '' : 'disabled'}" onclick="window.gameFuncs.startBuild('${item.id}', 'furniture')" ${canAfford ? '' : 'disabled'}>
                    🪙 ${item.cost.gold}
                </button>
            `;
            furnitureTab.appendChild(itemEl);
        });

        // Equipment Tab
        const equipmentTab = document.getElementById('equipment-tab');
        equipmentTab.innerHTML = '';
        Object.values(equipmentData).forEach(item => {
            const isOwned = gameState.ownedEquipment.includes(item.id);
            const canAfford = gameState.resources.gold >= item.cost.gold;
            const itemEl = document.createElement('div');
            itemEl.className = 'shop-item';
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>${item.sprite} ${item.name}</h4>
                    <p>Used for: ${item.type} recipes</p>
                </div>
                <button class="build-item-btn ${canAfford && !isOwned ? '' : 'disabled'}" onclick="window.gameFuncs.startBuild('${item.id}', 'equipment')" ${canAfford && !isOwned ? '' : 'disabled'}>
                    ${isOwned ? 'Owned' : `🪙 ${item.cost.gold}`}
                </button>
            `;
            equipmentTab.appendChild(itemEl);
        });

        openModal(buildModal);
    }

    function openCookbookModal() {
        const recipeList = document.getElementById('recipe-list');
        recipeList.innerHTML = '';
        Object.values(recipesData).forEach(recipe => {
            const isUnlocked = gameState.unlockedRecipes.includes(recipe.id);
            const itemEl = document.createElement('div');
            itemEl.className = `recipe-item ${isUnlocked ? 'unlocked' : 'locked'}`;
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>${recipe.sprite} ${recipe.name}</h4>
                    <p>Requires: ${recipe.equipmentNeeded} | Sells for: 🪙 ${recipe.price}</p>
                </div>
                <button class="buy-btn" ${isUnlocked ? 'disabled' : ''}>
                    ${isUnlocked ? 'Known' : 'Unlock'}
                </button>
            `;
            // Note: Recipe unlock logic not implemented in this prototype
            recipeList.appendChild(itemEl);
        });
        openModal(cookbookModal);
    }
    
    function openShopModal() {
        // Gourmet Tokens Tab
        const currencyTab = document.getElementById('premium-currency-tab');
        currencyTab.innerHTML = '';
        Object.values(iapData).forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'shop-item';
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>🌟 ${item.name}</h4>
                </div>
                <button class="buy-btn" onclick="window.gameFuncs.buyIAP('${item.id}')">
                    Buy (${item.cost} Stars)
                </button>
            `;
            currencyTab.appendChild(itemEl);
        });

        // Premium Items Tab
        const premiumTab = document.getElementById('premium-items-tab');
        premiumTab.innerHTML = '';
        Object.values(furnitureData).forEach(item => {
            if (!item.isPremium) return;
            const canAfford = gameState.resources.tokens >= item.cost.tokens;
            const itemEl = document.createElement('div');
            itemEl.className = 'shop-item';
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>${item.sprite} ${item.name}</h4>
                    <p>Huge Appeal Boost: ❤️+${item.appeal}</p>
                </div>
                <button class="build-item-btn ${canAfford ? '' : 'disabled'}" onclick="window.gameFuncs.startBuild('${item.id}', 'furniture')" ${canAfford ? '' : 'disabled'}>
                    🌟 ${item.cost.tokens}
                </button>
            `;
            premiumTab.appendChild(itemEl);
        });
        
        openModal(shopModal);
    }

    function openTab(evt, tabName) {
        let i, tabcontent, tablinks;
        const parent = evt.currentTarget.closest('.modal');
        tabcontent = parent.getElementsByClassName("tab-content");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        tablinks = parent.getElementsByClassName("tab-link");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    }

    // --- MONETIZATION ---
    function buyIAP(itemId) {
        const item = iapData[itemId];
        // In a real app, this opens the Telegram Stars invoice.
        // For this prototype, we simulate a successful purchase.
        console.log(`Simulating purchase of ${item.name} for ${item.cost} Stars.`);
        // tg.openInvoice(...)
        
        gameState.resources.tokens += item.provides.tokens;
        updateResourceBar();
        tg.HapticFeedback.notificationOccurred('success');
        showMessage("Purchase Successful!", `You received ${item.provides.tokens} Gourmet Tokens!`);
    }

    function startRushHourAd() {
        console.log("Simulating rewarded ad for Rush Hour.");
        // In a real app: tg.showAd().then(...)
        gameState.boosts.rushHour.active = true;
        gameState.boosts.rushHour.endTime = Date.now() + 5 * 60 * 1000; // 5 minutes
        tg.HapticFeedback.notificationOccurred('success');
        showMessage("Rush Hour Active!", "All earnings are doubled for the next 5 minutes!");
    }
    
    function checkForRushHourEnd(now) {
        if(gameState.boosts.rushHour.active && now > gameState.boosts.rushHour.endTime) {
            gameState.boosts.rushHour.active = false;
            console.log("Rush hour ended.");
            showMessage("Boost Ended", "Rush Hour has finished.");
        }
    }

    function startCleanCafeAd() {
         console.log("Simulating rewarded ad for Clean Cafe.");
         // In a real app: tg.showAd().then(...)
         // This is a simple instant boost
         gameState.cafeAppeal += 10;
         updateResourceBar();
         tg.HapticFeedback.notificationOccurred('success');
         showMessage("Cafe Sparkles!", "You got a temporary +10 Appeal boost!");
         // The boost could be temporary by setting a timer to remove it
         setTimeout(() => {
            gameState.cafeAppeal -= 10;
            updateResourceBar();
            console.log("Temporary appeal boost wore off.");
         }, 5 * 60 * 1000); // 5 minute boost
    }
    
    // Expose functions to be called from inline HTML onclick
    window.gameFuncs = {
        startBuild: enterBuildMode,
        buyIAP,
    };

    window.openTab = openTab;
    window.closeAllModals = closeAllModals;
    window.startRushHourAd = startRushHourAd;
    window.startCleanCafeAd = startCleanCafeAd;
    
    // --- START THE GAME ---
    initGame();
});
