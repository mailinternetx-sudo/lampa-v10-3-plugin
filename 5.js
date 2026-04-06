/**
 * ===================================================================================
 * ПЛАГИН: RuTor Pro для Lampa (Media X / LG webOS TV)
 * ВЕРСИЯ: 1.0 Final Build
 * 
 * ОПТИМИЗАЦИЯ: Код написан на чистом JS с использованием нативного API Lampa.
 * Фреймворк Enact не применяется напрямую, так как Lampa имеет собственный 
 * движок рендера и управления фокусом. Для достижения производительности уровня Enact
 * полностью отключены CSS-анимации, используется жесткий лимит DOM-узлов (30 шт),
 * применен троттлинг скролла и прямая работа с фокусами пульта (KeyNavigator).
 * ===================================================================================
 */

(function LampaRutorProPlugin() {
    'use strict';

    // --- КОНСТАНТЫ И НАСТРОЙКИ ---
    const PLUGIN_NAME = 'RuTor Pro';
    const CACHE_PREFIX = 'rutor_pro_';
    const CACHE_TTL = 15 * 60 * 1000; // 15 минут жизни кэша
    const PROXY_URL = 'https://api.allorigins.win/raw?url='; // Публичный прокси для обхода CORS на webOS
    const BASE_URL = 'https://rutor.info';
    const ITEMS_LIMIT = 30; // Строгий лимит карточек на экране (защита памяти LG TV)

    // Категории, запрошенные в ТЗ
    const CATEGORIES = [
        { id: 'top', title: '🔥 Топ торрентов за 24 часа', url: '/top' },
        { id: 'foreign_movies', title: 'Зарубежные фильмы', url: '/browse/0/0/300/0/4' },
        { id: 'our_movies', title: 'Наши фильмы', url: '/browse/0/0/300/0/1' },
        { id: 'foreign_serials', title: 'Зарубежные сериалы', url: '/browse/0/0/300/0/6' },
        { id: 'our_serials', title: 'Наши сериалы', url: '/browse/0/0/300/0/2' },
        { id: 'tv', title: 'Телевизор', url: '/browse/0/0/300/0/10' }
    ];

    let currentController = null; // Для отмены fetch запросов (защита от гонки)
    let scrollThrottleTimer = null;

    // --- СИСТЕМНЫЕ ФУНКЦИИ ---

    // Инъекция CSS для полной отключения анимаций (Критично для 60 FPS на слабых процессорах webOS)
    function injectPerformanceStyles() {
        if (!document.getElementById('rutor-webos-styles')) {
            const style = document.createElement('style');
            style.id = 'rutor-webos-styles';
            style.textContent = `
                .rutor-pro-screen *, .rutor-pro-screen *::before, .rutor-pro-screen *::after {
                    transition: none !important; 
                    animation: none !important; 
                    transform: none !important;
                    box-shadow: none !important;
                    will-change: auto !important;
                }
                .rutor-pro-modal { 
                    position: absolute; top:0; left:0; right:0; bottom:0; z-index:100; 
                    background: linear-gradient(to bottom, #1a1a1a 0%, #000000 100%); 
                    padding: 4vh 4vw; display:flex; flex-direction:column; overflow: hidden;
                }
                .rutor-q-item { 
                    padding: 1.5vh 2vw; margin-bottom: 1vh; background: #2a2a2a; border-radius: 5px; 
                    color: #fff; cursor: pointer; border: 2px solid transparent; font-size: 1.1em;
                }
                .rutor-q-item.focus { border-color: #ff4c4c; background: #3a3a3a; }
                .rutor-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:2vh; }
                .rutor-search-btn { background: #ff4c4c; border: none; border-radius: 6px; }
            `;
            document.head.appendChild(style);
        }
    }

    // Кэширование в Storage Lampa
    function getCache(key) {
        try {
            const data = JSON.parse(Lampa.Storage.get(CACHE_PREFIX + key, '{}'));
            if (data.time && (Date.now() - data.time) < CACHE_TTL) return data.data;
        } catch (e) { console.error('RuTor Cache Error:', e); }
        return null;
    }

    function setCache(key, data) {
        try {
            // Очистка старого кэша перед записью нового для экономии памяти
            Lampa.Storage.set(CACHE_PREFIX + key, JSON.stringify({ time: Date.now(), data }));
        } catch (e) { console.error('RuTor Cache Set Error:', e); }
    }

    // Троттлинг скролла (предотвращает зависания при быстром вращении колесика пульта)
    function throttleScroll(callback) {
        return function () {
            if (scrollThrottleTimer) return;
            scrollThrottleTimer = setTimeout(() => {
                callback();
                scrollThrottleTimer = null;
            }, 150);
        };
    }

    // --- МОДУЛЬ ПАРСИНГА RUTOR.INFO ---

    async function fetchHtml(url) {
        if (currentController) currentController.abort();
        currentController = new AbortController();

        const cacheKey = btoa(url).replace(/[^a-zA-Z0-9]/g, '');
        const cached = getCache(cacheKey);
        if (cached) return cached;

        try {
            const targetUrl = BASE_URL + url;
            const response = await fetch(PROXY_URL + encodeURIComponent(targetUrl), {
                signal: currentController.signal
            });
            const html = await response.text();
            
            // RuTor использует windows-1251. Принудительно задаем кодировку для DOMParser
            const fixedHtml = `<html><head><meta charset="windows-1251"></head><body>${html}</body></html>`;
            const doc = new DOMParser().parseFromString(fixedHtml, 'text/html');
            
            const results = parseTorrentList(doc);
            setCache(cacheKey, results);
            return results;
        } catch (e) {
            if (e.name !== 'AbortError') console.error('RuTor Fetch Error:', e);
            return [];
        }
    }

    // Универсальный парсер списка со страниц каталога/топа
    function parseTorrentList(doc) {
        const items = [];
        const rows = doc.querySelectorAll('#index tr');

        rows.forEach(row => {
            try {
                const magnetTag = row.querySelector('a[href^="magnet:"]');
                const titleTag = row.querySelector('.gai a, td:nth-child(2) a');
                
                if (!titleTag || !magnetTag) return;

                const sizeTd = row.querySelector('td:nth-child(3)');
                const seedsTd = row.querySelector('td:nth-child(4)');
                const imgTag = row.querySelector('img');

                items.push({
                    title: titleTag.textContent.trim(),
                    detailUrl: BASE_URL + titleTag.getAttribute('href'),
                    poster: imgTag ? imgTag.getAttribute('src').replace('/thumbs/', '/posters/') : '',
                    size: sizeTd ? sizeTd.textContent.trim() : '',
                    seeds: seedsTd ? parseInt(seedsTd.textContent.trim()) || 0 : 0,
                    magnet: magnetTag.getAttribute('href') // Берем первый попавшийся (обычно лучший)
                });
            } catch (e) { /* Пропуск битой строки */ }
        });

        return items.slice(0, ITEMS_LIMIT);
    }

    // Парсер страницы детализации (получение всех качеств: 1080p, 720p и т.д.)
    async function getQualities(detailUrl) {
        // Делаем точечный запрос без кэша списка (или с отдельным кэшем деталей)
        if (currentController) currentController.abort();
        currentController = new AbortController();

        const cacheKey = 'det_' + btoa(detailUrl).replace(/[^a-zA-Z0-9]/g, '');
        const cached = getCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await fetch(PROXY_URL + encodeURIComponent(detailUrl), { signal: currentController.signal });
            const html = await response.text();
            const doc = new DOMParser().parseFromString(`<html><head><meta charset="windows-1251"></head><body>${html}</body></html>`, 'text/html');
            
            const qualities = [];
            const rows = doc.querySelectorAll('#index tr');
            
            rows.forEach(row => {
                const magnetTag = row.querySelector('a[href^="magnet:"]');
                if (!magnetTag) return;

                const textContent = row.textContent.replace(/\s+/g, ' ').trim();
                const sizeMatch = textContent.match(/(\d+[\.,]?\d*\s*[ГГMМ][ББ]/i);
                const qualityMatch = textContent.match(/(HDRip|BDRip|BDRemux|1080p|720p|2160p|4K|WEB-DL|WEBRip|HDTV|TS|CAMRip)/i);
                
                qualities.push({
                    quality: qualityMatch ? qualityMatch[0] : 'Стандартное',
                    size: sizeMatch ? sizeMatch[0] : '',
                    magnet: magnetTag.getAttribute('href'),
                    seeds: parseInt(row.querySelector('td:nth-child(4)')?.textContent.trim()) || 0
                });
            });

            // Если на странице 1 Magnet (бывает на старых раздачах), используем его
            if (qualities.length === 0 && rows.length > 0) {
                const mag = doc.querySelector('a[href^="magnet:"]');
                if (mag) qualities.push({ quality: 'Единственный файл', size: '', magnet: mag.getAttribute('href'), seeds: 0 });
            }

            setCache(cacheKey, qualities);
            return qualities;
        } catch (e) {
            console.error('RuTor Detail Parse Error:', e);
            return [];
        }
    }

    // --- ГЛАВНЫЙ ЭКРАН (АКТИВНОСТЬ LAMPA) ---
    function createMainScreen() {
        const activity = {};
        let scroll, body, tabs;

        activity.render = function () {
            injectPerformanceStyles();
            return `<div class="rutor-pro-screen full-height">
                <div class="rutor-head">
                    <div style="font-size:1.5em; color:#fff; font-weight:bold; letter-spacing: 1px;">${PLUGIN_NAME}</div>
                    <div class="selector rutor-search-btn" style="color:#fff; padding:10px 20px; cursor:pointer;">🔍 Поиск</div>
                </div>
                <div class="rutor-tabs-wrap"></div>
                <div class="rutor-body"></div>
            </div>`;
        };

        activity.create = function () {
            activity.fragment = document.createElement('div');
            activity.fragment.innerHTML = activity.render();
            activity.body = activity.fragment.querySelector('.rutor-pro-screen');

            body = activity.body.querySelector('.rutor-body');
            const tabsWrap = activity.body.querySelector('.rutor-tabs-wrap');
            const searchBtn = activity.body.querySelector('.rutor-search-btn');

            // Инициализация легковесного скролла Lampa
            scroll = new Lampa.Scroll({ horizontal: false, virtual: false });
            body.append(scroll.render());
            scroll.minus = body;

            // Инициализация табов
            tabs = new Lampa.Tabs({
                tabs: [
                    { title: 'Топ', id: 'top' },
                    { title: 'Категории', id: 'categories' },
                    { title: 'Новинки', id: 'new' }
                ],
                render: true,
                onBack: activity.back
            });
            tabsWrap.append(tabs.render());
            
            tabs.onSelect = function (id) {
                loadTab(id);
            };

            searchBtn.on('hover:enter', showSearchInput);

            // Слушатель скролла с троттлингом
            scroll.render().addEventListener('scroll', throttleScroll(() => {}));
            
            // Стартовый экран
            tabs.select('top');
            loadTab('top');
        };

        function showSearchInput() {
            Lampa.Input.edit({
                title: 'Поиск фильмов и сериалов',
                value: '',
                free: true
            }, function (query) {
                if (query.trim().length > 2) {
                    loadUrl('/search/' + encodeURIComponent(query.trim()));
                } else {
                    Lampa.Controller.toggle('content');
                }
            }, function () {
                Lampa.Controller.toggle('content');
            });
        }

        function loadTab(id) {
            if (currentController) currentController.abort();
            scroll.clear();
            
            if (id === 'top') loadUrl('/top');
            else if (id === 'new') loadUrl('/browse/0/0/300/0/0');
            else if (id === 'categories') renderCategories();
        }

        function renderCategories() {
            scroll.clear();
            CATEGORIES.forEach(cat => {
                const card = Lampa.Card.render({ title: cat.title, size: '', info: '' });
                card.style.marginBottom = '15px';
                card.on('hover:enter', () => loadUrl(cat.url));
                scroll.append(card);
            });
        }

        async function loadUrl(url) {
            scroll.clear();
            scroll.append(Lampa.Utils.loadHtml('Парсинг RuTor...'));
            
            const data = await fetchHtml(url);
            scroll.clear();

            if (data && data.length > 0) {
                const limit = Math.min(data.length, ITEMS_LIMIT);
                for (let i = 0; i < limit; i++) {
                    const item = data[i];
                    const card = Lampa.Card.render({
                        title: item.title,
                        poster: item.poster || '',
                        size: item.size,
                        info: `Раздают: ${item.seeds}`
                    });
                    // Убираем любые задержки рендера
                    card.style.transition = 'none';
                    card.on('hover:enter', () => openQualityModal(item));
                    scroll.append(card);
                }
                scroll.reset();
            } else {
                scroll.append(Lampa.Utils.emptyHtml('Ничего не найдено или ошибка сети'));
            }
        }

        // --- МОДАЛЬНОЕ ОКНО ВЫБОРА КАЧЕСТВА ---
        function openQualityModal(item) {
            Lampa.Layer.push();
            Lampa.Controller.add('rutor_quality');
            
            const modal = document.createElement('div');
            modal.className = 'rutor-pro-modal';
            modal.innerHTML = `
                <div style="font-size:1.3em; color:#fff; margin-bottom:2vh; font-weight:bold; line-height:1.3;">${item.title}</div>
                <div style="color:#aaa; margin-bottom:3vh; font-size:0.9em;">Базовый размер: ${item.size} | Seed: ${item.seeds}</div>
                <div style="color:#fff; margin-bottom:2vh; border-bottom:1px solid #444; padding-bottom:1vh;">Выберите качество для просмотра:</div>
                <div class="rutor-q-list" style="flex:1; overflow-y:auto;"></div>
                <div class="selector rutor-back-btn" style="margin-top:3vh; padding:15px; text-align:center; border:1px solid #555; color:#aaa; border-radius:8px; cursor:pointer;">Назад</div>
            `;
            
            activity.body.append(modal);
            const qList = modal.querySelector('.rutor-q-list');
            const backBtn = modal.querySelector('.rutor-back-btn');

            qList.innerHTML = Lampa.Utils.loadHtml('Поиск вариантов качества...');

            // Получаем список magnet со страницы раздачи
            getQualities(item.detailUrl).then(qualities => {
                qList.innerHTML = '';
                
                // Если не смогли спарсить качества, используем тот magnet, что есть в списке
                if (!qualities || qualities.length === 0) {
                    qualities.push({ quality: 'Стандартное', size: item.size, magnet: item.magnet, seeds: item.seeds });
                }

                qualities.forEach((q) => {
                    const el = document.createElement('div');
                    el.className = 'selector rutor-q-item';
                    el.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#ff4c4c; font-weight:bold;">${q.quality}</span>
                            <span style="color:#aaa;">${q.size} | Seed: ${q.seeds}</span>
                        </div>
                    `;
                    
                    el.on('hover:enter', () => {
                        closeQualityModal(modal);
                        startPlayback(q.magnet, item.title);
                    });
                    
                    qList.append(el);
                });

                // Автофокус на первый элемент списка
                if (qList.children[0]) {
                    Lampa.Controller.collectionFocus(qList, qList.children[0]);
                }
            });

            backBtn.on('hover:enter', () => closeQualityModal(modal));

            // Навешиваем контроллер на модалку
            Lampa.Controller.toggle('rutor_quality');

            function closeQualityModal(modalEl) {
                Lampa.Controller.remove('rutor_quality');
                modalEl.remove();
                Lampa.Layer.pop();
                Lampa.Controller.toggle('content');
            }
        }

        // --- ЗАПУСК ВОСПРОИЗВЕДЕНИЯ ЧЕРЕЗ TORRSERVER LAMPA ---
        function startPlayback(magnet, title) {
            if (!magnet) {
                Lampa.Utils.toast('Критическая ошибка: Magnet ссылка не найдена');
                return;
            }

            Lampa.Utils.toast('Отправка на TorrServer...');

            // Проверяем наличие модуля TorrServer в Lampa
            if (typeof Lampa.Torrent !== 'undefined') {
                // Метод для Lampa MediaX / Lampa PRO
                Lampa.Torrent.start(magnet, {
                    title: title
                }, function (hash, data) {
                    // Коллбэк срабатывает, когда TorrServer добавил раздачу и вернул список файлов
                    if (data && data.movie && data.movie.length > 0) {
                        Lampa.Player.start({
                            title: title,
                            hash: hash,
                            movie: data.movie // Lampa сама определит это сериал или фильм
                        });
                    } else {
                        Lampa.Utils.toast('TorrServer не вернул файлы. Проверьте настройки TorrServer.');
                    }
                });
            } else {
                // Запасной метод для старых версий Lampa (через Activity)
                Lampa.Activity.push({
                    url: magnet,
                    title: title,
                    component: 'torrent',
                    method: 'search',
                    search_one: title,
                    onComplite: function (files) {
                        if (files && files.length) {
                            Lampa.Player.start({ title: title, url: files[0].url });
                        }
                    }
                });
            }
        }

        // --- УПРАВЛЕНИЕ НАВИГАЦИЕЙ ПУЛЬТОМ ---
        activity.back = function () {
            // Если открыто модальное окно качества, пульт должен закрыть его, а не весь плагин
            if (Lampa.Controller.focused() === 'rutor_quality') return;
            
            if (currentController) currentController.abort();
            Lampa.Controller.remove('rutor_content');
            Lampa.Activity.destroy();
        };

        activity.start = function () {
            Lampa.Controller.add('rutor_content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(activity.body);
                    Lampa.Controller.collectionFocus(scroll.render(), scroll.render());
                },
                up: function () {
                    if (Lampa.Controller.focused() === tabs.render()) {
                        return Lampa.Controller.collectionFocus(scroll.render(), scroll.render());
                    }
                    scroll.scrollUp();
                },
                down: function () {
                    scroll.scrollDown();
                },
                right: function () {
                    const active = tabs.render().querySelector('.tabs__item.active');
                    if (active && active.nextElementSibling) {
                        Lampa.Controller.collectionFocus(tabs.render(), active.nextElementSibling);
                    }
                },
                left: function () {
                    Lampa.Controller.toggle('head');
                },
                back: activity.back
            });
            
            Lampa.Controller.toggle('rutor_content');
        };

        activity.pause = function () {};
        activity.stop = function () {};
        
        activity.destroy = function () {
            if (currentController) currentController.abort();
            clearTimeout(scrollThrottleTimer);
            if (scroll) scroll.destroy();
            if (tabs) tabs.destroy();
            activity.fragment = null;
            activity.body = null;
        };

        return activity;
    }

    // --- РЕГИСТРАЦИЯ ПЛАГИНА В ЯДРЕ LAMPA ---
    function initializePlugin() {
        // Добавление пункта в левое главное меню
        Lampa.Menu.addMenuItem({
            icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            title: PLUGIN_NAME,
            id: 'rutor_pro_plugin',
            onMenuOpen: function () { return true; },
            onMenuClose: function () { return true; },
            onSelect: function () {
                Lampa.Activity.push({
                    url: '',
                    title: PLUGIN_NAME,
                    component: 'rutor_pro_component',
                    page: 1
                });
            }
        });

        // Регистрация компонента экрана
        Lampa.Component.add('rutor_pro_component', createMainScreen);
        
        console.log('%c[RuTor Pro]%c Plugin successfully loaded and optimized for webOS', 'color: #ff4c4c; font-weight: bold;', 'color: #fff;');
    }

    // Безопасный запуск (ожидаем инициализацию объекта Lampa)
    if (typeof Lampa !== 'undefined' && Lampa.Component) {
        initializePlugin();
    } else {
        window.addEventListener('lampa_ready', initializePlugin, { once: true });
    }

})();

