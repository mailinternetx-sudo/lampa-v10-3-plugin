<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>TorrView - просмотр фильмов из торрентов</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #fff;
            min-height: 100vh;
            overflow-x: hidden;
        }

        /* Шапка */
        .header {
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(10px);
            padding: 20px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo h1 {
            font-size: 1.8rem;
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }

        .logo p {
            font-size: 0.8rem;
            color: #888;
        }

        .settings-btn {
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 10px 20px;
            border-radius: 25px;
            transition: all 0.3s;
        }

        .settings-btn:hover {
            background: rgba(255,255,255,0.2);
            transform: scale(1.05);
        }

        /* Основной контент */
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 30px;
        }

        /* Поиск */
        .search-section {
            margin-bottom: 40px;
        }

        .search-box {
            display: flex;
            gap: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 50px;
            padding: 5px 20px;
            backdrop-filter: blur(10px);
        }

        .search-box input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 18px 0;
            font-size: 1.1rem;
            color: white;
            outline: none;
        }

        .search-box input::placeholder {
            color: #888;
        }

        .search-box button {
            background: #e74c3c;
            border: none;
            color: white;
            padding: 0 25px;
            border-radius: 40px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
        }

        .search-box button:hover {
            background: #c0392b;
            transform: scale(1.02);
        }

        /* Категории */
        .categories {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }

        .category {
            background: rgba(255,255,255,0.1);
            padding: 8px 20px;
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .category.active {
            background: #e74c3c;
        }

        .category:hover {
            background: rgba(231,76,60,0.7);
        }

        /* Сетка фильмов */
        .movies-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 25px;
        }

        .movie-card {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.3s;
            animation: fadeIn 0.5s ease;
        }

        .movie-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .movie-poster {
            width: 100%;
            height: 300px;
            background: #1a1a2e;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
        }

        .movie-poster img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .movie-info {
            padding: 15px;
        }

        .movie-title {
            font-size: 1rem;
            font-weight: bold;
            margin-bottom: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .movie-year {
            color: #888;
            font-size: 0.85rem;
        }

        /* Модальное окно */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: #1a1a2e;
            border-radius: 20px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            padding: 30px;
        }

        .modal-content h2 {
            margin-bottom: 20px;
            color: #e74c3c;
        }

        .modal-content input, .modal-content select {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 10px;
            color: white;
            font-size: 1rem;
        }

        .modal-content button {
            background: #e74c3c;
            border: none;
            color: white;
            padding: 12px;
            border-radius: 10px;
            cursor: pointer;
            width: 100%;
            margin-top: 10px;
            font-size: 1rem;
        }

        .close-modal {
            background: #555;
        }

        /* Плеер */
        .player-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: black;
            z-index: 2000;
        }

        .player-modal.active {
            display: block;
        }

        .player-container {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        video {
            max-width: 100%;
            max-height: 100vh;
        }

        .close-player {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            border: none;
            color: white;
            font-size: 1.5rem;
            padding: 10px 15px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 2001;
        }

        /* Лоадер */
        .loader {
            display: none;
            text-align: center;
            padding: 50px;
        }

        .loader.active {
            display: block;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255,255,255,0.2);
            border-top-color: #e74c3c;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Статус TorrServer */
        .status-badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 10px;
            font-size: 0.7rem;
            margin-left: 15px;
        }

        .status-online {
            background: #27ae60;
        }

        .status-offline {
            background: #c0392b;
        }

        /* Адаптив */
        @media (max-width: 768px) {
            .movies-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
            }
            
            .movie-poster {
                height: 220px;
            }
            
            .container {
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <h1>🎬 TorrView</h1>
            <p>Просмотр фильмов из торрентов</p>
        </div>
        <button class="settings-btn" id="settingsBtn">⚙️ Настройки</button>
    </div>

    <div class="container">
        <div class="search-section">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Поиск фильмов...">
                <button id="searchBtn">🔍 Найти</button>
            </div>
        </div>

        <div class="categories">
            <div class="category active" data-category="popular">🔥 Популярные</div>
            <div class="category" data-category="now_playing">📽️ В кинотеатрах</div>
            <div class="category" data-category="top_rated">⭐ Топ-250</div>
            <div class="category" data-category="upcoming">📅 Ожидаемые</div>
        </div>

        <div class="loader" id="loader">
            <div class="spinner"></div>
            <p>Загрузка...</p>
        </div>

        <div class="movies-grid" id="moviesGrid"></div>
    </div>

    <!-- Модальное окно настроек -->
    <div class="modal" id="settingsModal">
        <div class="modal-content">
            <h2>⚙️ Настройки TorrServer</h2>
            <label>Адрес TorrServer:</label>
            <input type="text" id="torrServerUrl" placeholder="http://127.0.0.1:8090">
            <small style="color:#888; display:block; margin-bottom:10px;">
                Примеры: http://127.0.0.1:8090 (локально) или http://192.168.1.100:8090 (в сети)
            </small>
            <label>Проверка подключения:</label>
            <button id="checkConnectionBtn">🔌 Проверить соединение</button>
            <div id="connectionStatus" style="margin: 10px 0; padding: 10px; border-radius: 10px;"></div>
            <button id="saveSettingsBtn">💾 Сохранить настройки</button>
            <button class="close-modal" id="closeSettingsBtn">Закрыть</button>
        </div>
    </div>

    <!-- Модальное окно торрентов -->
    <div class="modal" id="torrentsModal">
        <div class="modal-content">
            <h2 id="movieTitle">Выбор торрента</h2>
            <div id="torrentsList"></div>
            <button class="close-modal" id="closeTorrentsBtn">Закрыть</button>
        </div>
    </div>

    <!-- Плеер -->
    <div class="player-modal" id="playerModal">
        <button class="close-player" id="closePlayerBtn">✕</button>
        <div class="player-container">
            <video id="videoPlayer" controls autoplay>
                Ваш браузер не поддерживает видео
            </video>
        </div>
    </div>

    <script>
        // Конфигурация
        let config = {
            torrServerUrl: localStorage.getItem('torrServerUrl') || 'http://127.0.0.1:8090'
        };

        // TMDB API (публичный ключ для демо, лучше заменить на свой)
        const TMDB_API_KEY = 'eb7c6f8e3a9b2c1d4e5f6a7b8c9d0e1f';
        const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

        // Сохранение настроек
        function saveConfig() {
            localStorage.setItem('torrServerUrl', config.torrServerUrl);
        }

        // Загрузка фильмов из TMDB
        async function loadMovies(category = 'popular', query = '') {
            const loader = document.getElementById('loader');
            const grid = document.getElementById('moviesGrid');
            
            loader.classList.add('active');
            grid.innerHTML = '';

            try {
                let url;
                if (query) {
                    url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`;
                } else {
                    url = `${TMDB_BASE_URL}/movie/${category}?api_key=${TMDB_API_KEY}&language=ru-RU&page=1`;
                }

                const response = await fetch(url);
                const data = await response.json();

                if (data.results && data.results.length > 0) {
                    displayMovies(data.results);
                } else {
                    grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">Фильмы не найдены</p>';
                }
            } catch (error) {
                console.error('Ошибка загрузки фильмов:', error);
                grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">Ошибка загрузки фильмов. Проверьте подключение к интернету.</p>';
            } finally {
                loader.classList.remove('active');
            }
        }

        // Отображение фильмов
        function displayMovies(movies) {
            const grid = document.getElementById('moviesGrid');
            grid.innerHTML = '';

            movies.forEach(movie => {
                const card = document.createElement('div');
                card.className = 'movie-card';
                card.onclick = () => showTorrents(movie);
                
                const posterUrl = movie.poster_path 
                    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                    : null;
                
                card.innerHTML = `
                    <div class="movie-poster">
                        ${posterUrl ? `<img src="${posterUrl}" alt="${movie.title}">` : '🎬'}
                    </div>
                    <div class="movie-info">
                        <div class="movie-title">${movie.title || 'Без названия'}</div>
                        <div class="movie-year">${movie.release_date ? movie.release_date.split('-')[0] : '----'}</div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        // Поиск торрентов (имитация через общедоступные API)
        async function searchTorrents(movieName, year) {
            // В реальном приложении здесь должен быть запрос к вашему парсеру
            // Для демонстрации возвращаем тестовые торренты
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve([
                        {
                            title: `${movieName} ${year || ''} BDRip 1080p`,
                            size: '2.5 GB',
                            seeds: 125,
                            magnet: 'magnet:?xt=urn:btih:demo123'
                        },
                        {
                            title: `${movieName} ${year || ''} WEB-DL 4K`,
                            size: '8.7 GB',
                            seeds: 89,
                            magnet: 'magnet:?xt=urn:btih:demo456'
                        },
                        {
                            title: `${movieName} ${year || ''} HDRip`,
                            size: '1.4 GB',
                            seeds: 234,
                            magnet: 'magnet:?xt=urn:btih:demo789'
                        }
                    ]);
                }, 500);
            });
        }

        // Показать список торрентов
        async function showTorrents(movie) {
            const modal = document.getElementById('torrentsModal');
            const titleEl = document.getElementById('movieTitle');
            const listEl = document.getElementById('torrentsList');
            
            titleEl.textContent = `🎯 ${movie.title} (${movie.release_date?.split('-')[0] || '----'})`;
            listEl.innerHTML = '<div class="loader active"><div class="spinner"></div><p>Поиск торрентов...</p></div>';
            
            modal.classList.add('active');
            
            try {
                const torrents = await searchTorrents(movie.title, movie.release_date?.split('-')[0]);
                
                if (torrents.length === 0) {
                    listEl.innerHTML = '<p style="text-align:center;">Торренты не найдены</p>';
                    return;
                }
                
                listEl.innerHTML = '';
                torrents.forEach(torrent => {
                    const torrentItem = document.createElement('div');
                    torrentItem.style.cssText = `
                        background: rgba(255,255,255,0.05);
                        padding: 15px;
                        margin: 10px 0;
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.3s;
                    `;
                    torrentItem.onmouseover = () => torrentItem.style.background = 'rgba(255,255,255,0.1)';
                    torrentItem.onmouseout = () => torrentItem.style.background = 'rgba(255,255,255,0.05)';
                    torrentItem.onclick = () => playTorrent(torrent.magnet);
                    
                    torrentItem.innerHTML = `
                        <div style="font-weight:bold;">${torrent.title}</div>
                        <div style="font-size:0.85rem; color:#888; margin-top:8px;">
                            📦 ${torrent.size} | 👥 ${torrent.seeds} раздающих
                        </div>
                    `;
                    listEl.appendChild(torrentItem);
                });
            } catch (error) {
                listEl.innerHTML = '<p style="text-align:center;color:#e74c3c;">Ошибка поиска торрентов</p>';
            }
        }

        // Воспроизведение через TorrServer
        async function playTorrent(magnetLink) {
            if (!config.torrServerUrl) {
                alert('Настройте адрес TorrServer в настройках');
                return;
            }
            
            // Закрываем модальное окно торрентов
            document.getElementById('torrentsModal').classList.remove('active');
            
            // Показываем плеер с загрузкой
            const playerModal = document.getElementById('playerModal');
            const video = document.getElementById('videoPlayer');
            
            playerModal.classList.add('active');
            video.poster = '';
            
            try {
                // Запрос к TorrServer для добавления торрента и получения потока
                const encodedMagnet = encodeURIComponent(magnetLink);
                const streamUrl = `${config.torrServerUrl}/stream?uri=${encodedMagnet}`;
                
                // Проверяем доступность сервера
                const checkResponse = await fetch(`${config.torrServerUrl}/echo`);
                if (!checkResponse.ok) throw new Error('TorrServer не отвечает');
                
                video.src = streamUrl;
                video.play().catch(e => console.error('Ошибка воспроизведения:', e));
                
            } catch (error) {
                console.error('Ошибка TorrServer:', error);
                alert(`Ошибка подключения к TorrServer: ${error.message}\nПроверьте настройки`);
                playerModal.classList.remove('active');
                video.src = '';
            }
        }

        // Проверка соединения с TorrServer
        async function checkTorrServerConnection() {
            const url = document.getElementById('torrServerUrl').value;
            const statusDiv = document.getElementById('connectionStatus');
            
            statusDiv.innerHTML = '<div class="spinner" style="width:30px;height:30px;"></div> Проверка...';
            statusDiv.style.background = 'rgba(255,255,255,0.1)';
            
            try {
                const response = await fetch(`${url}/echo`);
                if (response.ok) {
                    const version = await response.text();
                    statusDiv.innerHTML = `✅ TorrServer доступен! Версия: ${version.substring(0, 50)}`;
                    statusDiv.style.background = 'rgba(39,174,96,0.2)';
                    return true;
                } else {
                    throw new Error('Неверный ответ');
                }
            } catch (error) {
                statusDiv.innerHTML = '❌ TorrServer недоступен. Проверьте адрес и запущен ли сервер.';
                statusDiv.style.background = 'rgba(192,57,43,0.2)';
                return false;
            }
        }

        // Инициализация событий
        function initEvents() {
            // Настройки
            document.getElementById('settingsBtn').onclick = () => {
                document.getElementById('torrServerUrl').value = config.torrServerUrl;
                document.getElementById('settingsModal').classList.add('active');
            };
            
            document.getElementById('closeSettingsBtn').onclick = () => {
                document.getElementById('settingsModal').classList.remove('active');
            };
            
            document.getElementById('saveSettingsBtn').onclick = () => {
                const newUrl = document.getElementById('torrServerUrl').value.trim();
                if (newUrl) {
                    config.torrServerUrl = newUrl;
                    saveConfig();
                    alert('Настройки сохранены');
                    document.getElementById('settingsModal').classList.remove('active');
                } else {
                    alert('Введите адрес TorrServer');
                }
            };
            
            document.getElementById('checkConnectionBtn').onclick = checkTorrServerConnection;
            
            // Поиск
            document.getElementById('searchBtn').onclick = () => {
                const query = document.getElementById('searchInput').value.trim();
                if (query) {
                    loadMovies('', query);
                }
            };
            
            document.getElementById('searchInput').onkeypress = (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('searchBtn').click();
                }
            };
            
            // Категории
            document.querySelectorAll('.category').forEach(cat => {
                cat.onclick = () => {
                    document.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
                    cat.classList.add('active');
                    const category = cat.dataset.category;
                    document.getElementById('searchInput').value = '';
                    loadMovies(category);
                };
            });
            
            // Модальные окна
            document.getElementById('closeTorrentsBtn').onclick = () => {
                document.getElementById('torrentsModal').classList.remove('active');
            };
            
            document.getElementById('closePlayerBtn').onclick = () => {
                const playerModal = document.getElementById('playerModal');
                const video = document.getElementById('videoPlayer');
                video.pause();
                video.src = '';
                playerModal.classList.remove('active');
            };
            
            // Закрытие модалок по клику вне контента
            document.getElementById('settingsModal').onclick = (e) => {
                if (e.target === document.getElementById('settingsModal')) {
                    document.getElementById('settingsModal').classList.remove('active');
                }
            };
            
            document.getElementById('torrentsModal').onclick = (e) => {
                if (e.target === document.getElementById('torrentsModal')) {
                    document.getElementById('torrentsModal').classList.remove('active');
                }
            };
        }

        // Инициализация приложения
        function init() {
            initEvents();
            loadMovies('popular');
            
            // Проверяем статус TorrServer при старте
            setTimeout(() => {
                checkTorrServerConnection().then(online => {
                    const statusText = online ? '🟢 TorrServer онлайн' : '🔴 TorrServer не обнаружен';
                    console.log(statusText);
                });
            }, 1000);
        }

        // Запуск
        init();
    </script>
</body>
</html>
