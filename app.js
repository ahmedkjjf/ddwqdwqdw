// Constants and Configuration
const CONFIG = {
    MAX_RECENT_SEARCHES: 5,
    MAX_FAVORITES: 10,
    UPDATE_INTERVAL: 30000, // 30 seconds
    CHART_POINTS: 24, // Hours to show in charts
};

// State Management
const state = {
    currentServer: null,
    recentSearches: [],
    favorites: [],
    serverHistory: new Map(),
    charts: {},
    updateInterval: null
};

// Theme Management
const themeManager = {
    init() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        const savedColor = localStorage.getItem('colorTheme') || 'blue';
        this.setTheme(savedTheme);
        this.setColorTheme(savedColor);

        document.getElementById('themeToggle').addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            this.setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });

        document.querySelectorAll('.color-theme').forEach(button => {
            button.addEventListener('click', () => {
                this.setColorTheme(button.dataset.theme);
            });
        });
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const icon = document.querySelector('#themeToggle i');
        icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    },

    setColorTheme(color) {
        document.documentElement.setAttribute('data-color-theme', color);
        localStorage.setItem('colorTheme', color);
    }
};

// Server Data Management
const serverManager = {
    async searchServers(query) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(
                `https://servers-frontend.fivem.net/api/servers/search?q=${encodeURIComponent(query)}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorMessage = response.status === 429 ? 
                    'تم تجاوز حد محاولات البحث، الرجاء المحاولة بعد قليل' : 
                    'فشل البحث عن السيرفرات';
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error('لم يتم العثور على نتائج');
            }

            return data.data.map(server => ({
                id: server.EndPoint,
                name: server.hostname || 'Unknown Server',
                players: server.Data?.clients || 0,
                maxPlayers: server.sv_maxclients || 0,
                ping: server.Data?.ping || 0,
                details: {
                    gameMode: server.Data?.gametype || 'Unknown',
                    mapName: server.Data?.mapname || 'Unknown',
                    version: server.Data?.server || 'Unknown'
                }
            }));
        } catch (error) {
            if (error.name === 'AbortError') {
                showNotification('انتهت مهلة البحث، الرجاء المحاولة مرة أخرى', 'error');
            } else {
                showNotification(error.message || 'حدث خطأ في البحث عن السيرفرات', 'error');
            }
            throw error;
        }
    },

    async fetchServerData(cfxCode) {
        try {
            const response = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${cfxCode}`);
            if (!response.ok) throw new Error('Server not found');
            const data = await response.json();
            return this.processServerData(data);
        } catch (error) {
            showNotification('حدث خطأ في جلب بيانات السيرفر', 'error');
            throw error;
        }
    },

    processServerData(data) {
        const serverData = {
            id: data.Data.id,
            name: data.Data.hostname || 'Unknown Server',
            players: data.Data.players?.length || 0,
            maxPlayers: data.Data.sv_maxclients || 0,
            ping: data.Data.ping || 0,
            details: {
                gameMode: data.Data.gametype || 'Unknown',
                mapName: data.Data.mapname || 'Unknown',
                version: data.Data.server || 'Unknown'
            },
            playerList: data.Data.players || []
        };

        // Update server history
        if (!state.serverHistory.has(serverData.id)) {
            state.serverHistory.set(serverData.id, []);
        }

        const history = state.serverHistory.get(serverData.id);
        history.push({
            timestamp: new Date(),
            players: serverData.players
        });

        // Keep only last 24 hours of data
        while (history.length > CONFIG.CHART_POINTS) {
            history.shift();
        }

        return serverData;
    },

    updateServerInfo(data) {
        state.currentServer = data;  
        document.getElementById('serverName').textContent = data.name;
        document.getElementById('playerCount').textContent = data.players;
        document.getElementById('maxPlayers').textContent = data.maxPlayers;
        document.getElementById('ping').textContent = data.ping;

        // Update server details
        const detailsList = document.getElementById('serverDetails');
        detailsList.innerHTML = Object.entries(data.details)
            .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
            .join('');

        // Update players list
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = data.playerList
            .map(player => `<div class="player-item">${player.name || 'Unknown'}</div>`)
            .join('');

        // Update favorite button state
        const favoriteBtn = document.getElementById('favoriteBtn');
        const isFavorite = state.favorites.some(f => f.id === data.id);
        favoriteBtn.innerHTML = `<i class="${isFavorite ? 'fas' : 'far'} fa-star"></i>`;

        this.updateCharts(data);

        document.getElementById('serverInfo').classList.remove('hidden');
    },

    updateCharts(data) {
        const history = state.serverHistory.get(data.id);
        const labels = history.map(entry => {
            const date = new Date(entry.timestamp);
            return date.toLocaleTimeString('ar-SA');
        });
        const playerData = history.map(entry => entry.players);

        // Update or create players chart
        if (!state.charts.players) {
            const ctx = document.getElementById('playersChart').getContext('2d');
            state.charts.players = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'عدد اللاعبين',
                        data: playerData,
                        borderColor: getComputedStyle(document.documentElement)
                            .getPropertyValue('--primary-color'),
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(52, 152, 219, 0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'نشاط السيرفر'
                        }
                    }
                }
            });
        } else {
            state.charts.players.data.labels = labels;
            state.charts.players.data.datasets[0].data = playerData;
            state.charts.players.update();
        }
    },

    displaySearchResults(servers) {
        const container = document.getElementById('searchResults');
        if (!container) return;

        container.innerHTML = servers.length ? servers
            .map(server => `
                <div class="server-card">
                    <h3>${server.name}</h3>
                    <div class="server-stats">
                        <span>${server.players}/${server.maxPlayers} لاعب</span>
                        <span>${server.ping}ms</span>
                    </div>
                    <div class="server-details">
                        <span>${server.details.gameMode}</span>
                        <span>${server.details.mapName}</span>
                    </div>
                    <button class="primary-btn" onclick="handleServerSelect('${server.id}')">
                        اختيار السيرفر
                    </button>
                </div>
            `).join('') : '<div class="no-results">لم يتم العثور على نتائج</div>';
    },
};

// Local Storage Management
const storageManager = {
    init() {
        this.loadFromStorage();
        this.updateRecentSearches();
        this.updateFavorites();
    },

    loadFromStorage() {
        state.recentSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
        state.favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    },

    saveToStorage() {
        localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
        localStorage.setItem('favorites', JSON.stringify(state.favorites));
    },

    addRecentSearch(cfxCode) {
        state.recentSearches = [cfxCode, ...state.recentSearches
            .filter(code => code !== cfxCode)]
            .slice(0, CONFIG.MAX_RECENT_SEARCHES);
        this.saveToStorage();
        this.updateRecentSearches();
    },

    toggleFavorite(serverData) {
        const index = state.favorites.findIndex(f => f.id === serverData.id);
        if (index === -1) {
            if (state.favorites.length >= CONFIG.MAX_FAVORITES) {
                state.favorites.pop();
            }
            state.favorites.unshift(serverData);
            showNotification('تمت إضافة السيرفر إلى المفضلة');
        } else {
            state.favorites.splice(index, 1);
            showNotification('تمت إزالة السيرفر من المفضلة');
        }
        this.saveToStorage();
        this.updateFavorites();
    },

    updateRecentSearches() {
        const container = document.getElementById('recentSearches');
        container.innerHTML = state.recentSearches
            .map(code => `
                <button class="recent-search" data-code="${code}">
                    ${code}
                </button>
            `).join('');

        container.querySelectorAll('.recent-search').forEach(button => {
            button.addEventListener('click', () => {
                document.getElementById('serverInput').value = button.dataset.code;
                handleSearch();
            });
        });
    },

    updateFavorites() {
        const container = document.getElementById('favoritesGrid');
        if (!container) return;

        container.innerHTML = state.favorites
            .map(server => `
                <div class="favorite-card">
                    <h3>${escapeHtml(server.name)}</h3>
                    <div class="favorite-stats">
                        <span>${server.players}/${server.maxPlayers} لاعب</span>
                        <span>${server.ping}ms</span>
                    </div>
                    <button class="primary-btn view-server" data-id="${server.id}">
                        عرض التفاصيل
                    </button>
                    <button class="icon-btn remove-favorite" data-id="${server.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');

        // Add click handlers for view and remove buttons
        container.querySelectorAll('.view-server').forEach(button => {
            button.addEventListener('click', () => {
                const serverId = button.dataset.id;
                const server = state.favorites.find(s => s.id === serverId);
                if (server) {
                    state.currentServer = server;
                    serverManager.updateServerInfo(server);
                }
            });
        });

        container.querySelectorAll('.remove-favorite').forEach(button => {
            button.addEventListener('click', () => {
                const serverId = button.dataset.id;
                const server = state.favorites.find(s => s.id === serverId);
                if (server) {
                    this.toggleFavorite(server);
                }
            });
        });
    }
};

// FiveM Servers API endpoints
const FIVEM_API = {
    SERVERS: 'https://servers.fivem.net/servers/list',
    SERVER_INFO: 'https://servers.fivem.net/server'
};

// Global state
let currentServers = [];
let lastSearchQuery = '';

// Fetch all FiveM servers
async function fetchServers() {
    try {
        const response = await fetch(FIVEM_API.SERVERS);
        if (!response.ok) throw new Error('فشل في جلب قائمة السيرفرات');
        const data = await response.json();
        currentServers = data.servers || [];
        displayServers(currentServers);
    } catch (error) {
        showNotification('حدث خطأ في جلب السيرفرات', 'error');
    }
}

// Display servers in the search results
function displayServers(servers) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';

    if (servers.length === 0) {
        searchResults.innerHTML = '<div class="no-results">لا توجد نتائج</div>';
        return;
    }

    const serversList = document.createElement('div');
    serversList.className = 'servers-grid';

    servers.forEach(server => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card';
        serverCard.innerHTML = `
            <div class="server-card-header">
                <h3>${escapeHtml(server.hostname || 'سيرفر بدون اسم')}</h3>
                <span class="players-count">
                    <i class="fas fa-users"></i>
                    ${server.players}/${server.maxPlayers}
                </span>
            </div>
            <div class="server-card-details">
                <p><i class="fas fa-map-marker-alt"></i> ${server.locale || 'غير معروف'}</p>
                <p><i class="fas fa-gamepad"></i> ${server.gametype || 'غير محدد'}</p>
            </div>
            <button class="primary-btn view-server" data-cfx="${server.endpoint}">
                عرض التفاصيل
            </button>
        `;
        serversList.appendChild(serverCard);
    });

    searchResults.appendChild(serversList);

    // Add event listeners to view server buttons
    document.querySelectorAll('.view-server').forEach(button => {
        button.addEventListener('click', () => {
            const cfxId = button.getAttribute('data-cfx');
            loadServerDetails(cfxId);
        });
    });
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Search servers functionality
function searchServers(query) {
    if (!currentServers.length) {
        fetchServers();
        return;
    }

    const filteredServers = currentServers.filter(server => 
        server.hostname.toLowerCase().includes(query.toLowerCase()) ||
        server.gametype?.toLowerCase().includes(query.toLowerCase())
    );

    displayServers(filteredServers);
}

// UI Utilities
function showSavingAnimation() {
    const savingEl = document.createElement('div');
    savingEl.className = 'saving-transition';
    document.body.appendChild(savingEl);

    setTimeout(() => {
        savingEl.remove();
    }, 1000);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    showSavingAnimation(); // Add smooth saving animation

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Event Handlers
async function handleSearch() {
    const input = document.getElementById('serverInput');
    const cfxCode = input.value.trim();

    if (!cfxCode) {
        showNotification('الرجاء إدخال رابط صالح', 'error');
        return;
    }

    const match = cfxCode.match(/cfx\.re\/join\/(\w+)/);
    const code = match ? match[1] : cfxCode;

    try {
        document.getElementById('searchBtn').disabled = true;
        const serverData = await serverManager.fetchServerData(code);

        state.currentServer = serverData;
        serverManager.updateServerInfo(serverData);
        storageManager.addRecentSearch(code);

        document.getElementById('serverInfo').classList.remove('hidden');

        // Start auto-updates
        if (state.updateInterval) clearInterval(state.updateInterval);
        state.updateInterval = setInterval(async () => {
            const updatedData = await serverManager.fetchServerData(code);
            serverManager.updateServerInfo(updatedData);
        }, CONFIG.UPDATE_INTERVAL);
    } catch (error) {
        console.error('Search error:', error);
    } finally {
        document.getElementById('searchBtn').disabled = false;
    }
}

async function handleServerSearch() {
    const input = document.getElementById('searchInput');
    const query = input.value.trim();

    if (!query) {
        showNotification('الرجاء إدخال كلمة البحث', 'error');
        return;
    }

    try {
        document.getElementById('searchServersBtn').disabled = true;
        const servers = await serverManager.searchServers(query);
        serverManager.displaySearchResults(servers);
    } catch (error) {
        console.error('Search error:', error);
    } finally {
        document.getElementById('searchServersBtn').disabled = false;
    }
}

function handleServerSelect(serverId) {
    document.getElementById('serverInput').value = serverId;
    handleSearch();
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    themeManager.init();
    storageManager.init();

    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('searchServersBtn').addEventListener('click', handleServerSearch);
    document.getElementById('serverInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleServerSearch();
    });

    document.getElementById('favoriteBtn').addEventListener('click', () => {
        if (state.currentServer) {
            storageManager.toggleFavorite(state.currentServer);
        }
    });

    const searchInput = document.getElementById('searchInput');
    const searchServersBtn = document.getElementById('searchServersBtn');

    // Initial servers load
    fetchServers();

    // Search button click handler
    searchServersBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            searchServers(query);
        } else {
            displayServers(currentServers);
        }
    });

    // Search input enter key handler
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                searchServers(query);
            } else {
                displayServers(currentServers);
            }
        }
    });
});
