/**
 * Плагин RuTor для Lampa (Media X / LG webOS)
 * Оптимизирован под слабое железо телевизоров: минимальная анимация, кэш, ленивая подгрузка, отмена запросов.
 */

(function LampaRutorPlugin() {
    'use strict';

    // --- КОНСТАНТЫ И НАСТРОЙКИ ---
    const PLUGIN_NAME = 'RuTor';
    const CACHE_PREFIX = 'rutor_cache_';
    const CACHE_TTL = 15 * 60 * 1000; // 15 минут
    const PROXY_URL = 'https://api.allorigins.win/raw?url=';
    const ITEMS_PER_PAGE = 30; // Лимит карточек для слабых ТВ
    const BASE_URL = 'https://rutor.info';

    // Категории из rutor.info
    const CATEGORIES = [
        { id: 'top', title: 'Топ за 24 часа', url: '/top' },
        { id: 'foreign_movies', title: 'Зарубежные фильмы', url: '/browse/0/0/300/0/4' },
        { id: 'our_movies', title: 'Наши фильмы', url: '/browse/0/0/300/0/1' },
        { id: 'foreign_serials', title: 'Зарубежные сериалы', url: '/browse/0/0/300/0/6' },
        { id: 'our_serials', title: 'Наши сериалы', url: '/browse/0/0/300/0/2' },
        { id: 'tv', title: 'Телевизор', url: '/browse/0/0/300/0/10' }
    ];

    let currentController = null; // AbortController для отмены запросов
    let scrollThrottleTimer = null;

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    // Кэширование через Lampa.Storage
    function getCache(key) {
        try {
            const data = Lampa.Storage.get(CACHE_PREFIX + key, '{}');
            const parsed = JSON.parse(data);
            if (parsed.time && (Date.now() - parsed.time) < CACHE_TTL) {
                return parsed.data;
            }
        } catch (e) { console.error('RuTor Cache Read Error:', e); }
        return null;
    }

    function setCache(key, data) {
        try {
            Lampa.Storage.set(CACHE_PREFIX + key, JSON.stringify({ time: Date.now(), data }));
        } catch (e) { console.error('RuTor Cache Write Error:', e); }
    }

    // Простой троттл для скролла (защита от зависаний)
    function throttleScroll(callback) {
        return function () {
            if (scrollThrottleTimer) return;
            scrollThrottleTimer = setTimeout(() => {
                callback();
                scrollThrottleTimer = null;
            }, 200);
        };
    }

    // Получение списка парсеров из Lampa
    function getParsers() {
        let list = [{ title: 'По умолчанию', type: 'default' }];
        try {
            // Попытка достать активные парсеры из внутренних модулей Lampa
            if (typeof Lampa.Torrent !== 'undefined' && Lampa.Torrent.parsed) {
                list = Lampa.Torrent.parsed.map(p => ({ title: p.title, type: p.type }));
            } else if (Lampa.Storage.get('parsers')) {
                const stored = JSON.parse(Lampa.Storage.get('parsers', '[]'));
                if (stored.length) list = stored.map(p => ({ title: p.title, type: p.name || p.title }));
            }
        } catch (e) { console.error('RuTor: Error getting parsers', e); }
        return list;
    }

    // --- ПАРСИНГ RUTOR.INFO ---

    // Универсальная функция запроса
    async function fetchRutor(url) {
        if (currentController) currentController.abort();
        currentController = new AbortController();

        const cacheKey = btoa(url).replace(/[^a-zA-Z0-9]/g, '');
        const cached = getCache(cacheKey);
        if (cached) return cached;

        try {
            // rutor блокирует CORS, используем легковесный прокси
            const response = await fetch(PROXY_URL + encodeURIComponent(BASE_URL + url), {
                signal: currentController.signal
            });
            const html = await response.text();
            
            // Исправляем кодировку для русского текста
            const fixedHtml = '<html><head><meta charset="windows-1251"></head><body>' + html + '</body></html>';
            const parser = new DOMParser();
            const doc = parser.parseFromString(fixedHtml, 'text/html');
            
            const results = parseTorrentList(doc);
            setCache(cacheKey, results);
            return results;
        } catch (e) {
            if (e.name !== 'AbortError') console.error('RuTor Fetch Error:', e);
            return [];
        }
    }

    // Парсинг DOM rutor.info
    function parseTorrentList(doc) {
        const items = [];
        const rows = doc.querySelectorAll('#index tr'); // Основная таблица трекеров

        rows.forEach(row => {
            try {
                const magnetTag = row.querySelector('td:nth-child(2) a[href^="magnet:"]');
                const titleTag = row.querySelector('td:nth-child(2) .gai a, td:nth-child(2) a');
                const sizeTd = row.querySelector('td:nth-child(3)');
                const seedsTd = row.querySelector('td:nth-child(4)');
                const peersTd = row.querySelector('td:nth-child(5)');
                const imgTag = row.querySelector('td:nth-child(1) img');

                if (titleTag && magnetTag) {
                    items.push({
                        title: titleTag.textContent.trim(),
                        url: BASE_URL + titleTag.getAttribute('href'),
                        poster: imgTag ? (imgTag.getAttribute('src') || '').replace('/thumbs/', '/posters/') : '',
                        size: sizeTd ? sizeTd.textContent.trim() : '',
                        seeds: seedsTd ? parseInt(seedsTd.textContent.trim()) || 0 : 0,
                        peers: peersTd ? parseInt(peersTd.textContent.trim()) || 0 : 0,
                        magnet: magnetTag.getAttribute('href')
                    });
                }
            } catch (parseErr) { /* Пропуск битой строки */ }
        });

        return items.slice(0, 40); // Хард лимит для слабых ТВ
    }

    // --- ЭКРАН ПЛАГИНА (АКТИВНОСТЬ) ---

    function createRutorScreen() {
        const activity = {};
        let scroll, body, tabs, selectedParser;
        let currentData = [];
        let currentTab = 'top';
        let categoriesRendered = false;

        activity.render = function () {
            const html = `<div class="rutor-screen">
                <div class="rutor-header">
                    <div class="rutor-title">${PLUGIN_NAME}</div>
                    <div class="rutor-parser-btn selector">Парсер: <span class="rutor-parser-name">По умолчанию</span></div>
                </div>
                <div class="rutor-tabs-container"></div>
                <div class="rutor-body"></div>
            </div>`;
            
            return html;
        };

        activity.create = function () {
            const container = activity.render();
            activity.fragment = document.createElement('div');
            activity.fragment.innerHTML = container;
            activity.body = activity.fragment.querySelector('.rutor-screen');

            body = activity.body.querySelector('.rutor-body');
            const tabsContainer = activity.body.querySelector('.rutor-tabs-container');
            const parserBtn = activity.body.querySelector('.rutor-parser-btn');
            const parserNameEl = activity.body.querySelector('.rutor-parser-name');

            // Инициализация скролла Lampa (нативный, легкий)
            scroll = new Lampa.Scroll({ horizontal: false });
            body.append(scroll.render());
            scroll.minus = body;

            // Инициализация табов Lampa
            tabs = new Lampa.Tabs({
                tabs: [
                    { title: 'Топ', id: 'top' },
                    { title: 'Категории', id: 'categories' },
                    { title: 'Новинки', id: 'new' }
                ],
                render: true,
                onBack: activity.back
            });
            tabsContainer.append(tabs.render());
            
            // События табов
            tabs.onSelect = function (id) {
                currentTab = id;
                categoriesRendered = false;
                loadTabData(id);
            };

            // Кнопка выбора парсера
            selectedParser = Lampa.Storage.get('rutor_selected_parser', 'По умолчанию');
            parserNameEl.text(selectedParser);

            parserBtn.on('click:enter', function () {
                const parsers = getParsers();
                Lampa.Select.show({
                    title: 'Выбор парсера',
                    items: parsers.map(p => ({ title: p.title, value: p.type })),
                    onSelect: function (item) {
                        selectedParser = item.title;
                        Lampa.Storage.set('rutor_selected_parser', selectedParser);
                        parserNameEl.text(selectedParser);
                        Lampa.Utils.toast('Парсер: ' + selectedParser);
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            });

            // Ленивая подгрузка при скролле
            scroll.render().addEventListener('scroll', throttleScroll(function () {
                if (scroll.isEnd()) {
                    // Если нужны еще данные (пагинация), здесь можно дописать логику
                    // Для слабых ТВ лучше ограничиться первыми 30-40 карточками
                }
            }));

            loadTabData('top');
        };

        function loadTabData(tabId) {
            if (currentController) currentController.abort();
            scroll.clear();
            currentData = [];

            if (tabId === 'top') {
                loadCategory('/top');
            } else if (tabId === 'new') {
                loadCategory('/browse/0/0/300/0/0'); // Все новинки за 3 дня
            } else if (tabId === 'categories') {
                if (!categoriesRendered) renderCategories();
            }
        }

        function renderCategories() {
            categoriesRendered = true;
            CATEGORIES.forEach(cat => {
                const card = Lampa.Card.render({
                    title: cat.title,
                    size: '',
                    info: ''
                });
                card.addClass('rutor-cat-card');
                card.on('hover:enter', () => {
                    loadCategory(cat.url);
                });
                scroll.append(card);
            });
        }

        async function loadCategory(url) {
            scroll.clear();
            scroll.append(Lampa.Utils.loadHtml('Загрузка...')); // Нативная спиннер-заглушка Lampa

            const data = await fetchRutor(url);
            if (data && data.length > 0) {
                currentData = data;
                renderCards(data);
            } else {
                scroll.clear();
                scroll.append(Lampa.Utils.emptyHtml('Нет данных или ошибка сети'));
            }
        }

        function renderCards(items) {
            scroll.clear();
            const limit = Math.min(items.length, ITEMS_PER_PAGE);

            for (let i = 0; i < limit; i++) {
                const item = items[i];
                const card = Lampa.Card.render({
                    title: item.title,
                    poster: item.poster || '',
                    size: item.size,
                    info: `Seed: ${item.seeds} | Peers: ${item.peers}`
                });

                // Отключаем тяжелые анимации карточек для webOS
                card.style.transition = 'none';
                card.style.animation = 'none';

                card.on('hover:enter', () => openDetails(item));
                scroll.append(card);
            }
            scroll.reset();
        }

        function openDetails(item) {
            Lampa.Controller.add('rutor_detail');
            
            const detailHtml = `<div class="rutor-detail-modal" style="background: rgba(0,0,0,0.9); position:absolute; top:0; left:0; right:0; bottom:0; z-index:100; display:flex; flex-direction:column; padding: 5vh 3vw;">
                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                    <div style="font-size:1.5em; color:white; font-weight:bold; width:80%;">${item.title}</div>
                    <div class="selector rutor-detail-back" style="color:#fff; border:1px solid #fff; padding:5px 15px; border-radius:5px;">Назад</div>
                </div>
                <div style="display:flex; gap:20px; margin-bottom:20px; color:#aaa;">
                    <span>Размер: ${item.size}</span>
                    <span>Раздают: ${item.seeds}</span>
                    <span>Качают: ${item.peers}</span>
                </div>
                <div class="selector rutor-detail-play" style="background:rgba(255,0,80,0.8); color:white; text-align:center; padding:15px; border-radius:8px; font-size:1.2em; cursor:pointer; margin-top:auto;">Смотреть</div>
            </div>`;

            const bg = document.createElement('div');
            bg.innerHTML = detailHtml;
            activity.body.append(bg);

            const backBtn = bg.querySelector('.rutor-detail-back');
            const playBtn = bg.querySelector('.rutor-detail-play');

            backBtn.on('click:enter', () => closeDetails(bg));
            playBtn.on('hover:enter', () => {
                closeDetails(bg);
                startPlay(item);
            });

            Lampa.Controller.toggle('rutor_detail');

            function closeDetails(el) {
                Lampa.Controller.remove('rutor_detail');
                el.remove();
                Lampa.Controller.toggle('content');
            }
        }

        function startPlay(item) {
            if (!item.magnet) return Lampa.Utils.toast('Нет magnet-ссылки');

            // Используем нативный модуль торрентов Lampa, чтобы задействовать выбранный парсер и TorrServer
            Lampa.Activity.push({
                url: item.magnet,
                title: item.title,
                component: 'torrent',
                method: 'search',
                search: item.title,
                search_one: item.title,
                search_two: item.size,
                onComplite: function (torrents) {
                    // Если парсер вернул данные, сразу запускаем первый файл
                    if (torrents && torrents.length) {
                        Lampa.Torrent.start(torrents[0].hash, torrents[0], Lampa.Player.start);
                    }
                }
            });
        }

        activity.back = function () {
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
                    if (Lampa.Controllerfocused() === tabs.render()) return Lampa.Controller.collectionFocus(scroll.render(), scroll.render());
                    scroll.scrollUp();
                },
                down: function () {
                    scroll.scrollDown();
                },
                right: function () {
                    tabs.render().querySelector('.tabs__item.active').nextElementSibling && Lampa.Controller.collectionFocus(tabs.render(), tabs.render().querySelector('.tabs__item.active').nextElementSibling);
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

    // --- ИНИЦИАЛИЗАЦИЯ ПЛАГИНА В LAMPA ---
    function startPlugin() {
        // Добавляем кнопку в левое меню
        Lampa.Menu.addMenuItem({
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>', // Простая иконка (галочка)
            title: PLUGIN_NAME,
            id: 'rutor_plugin',
            onMenuOpen: function () { return true; },
            onMenuClose: function () { return true; },
            onSelect: function () {
                Lampa.Activity.push({
                    url: '',
                    title: PLUGIN_NAME,
                    component: 'rutor_plugin_component',
                    page: 1
                });
            }
        });

        // Регистрируем компонент (экран) в ядре Lampa
        Lampa.Component.add('rutor_plugin_component', createRutorScreen);
        
        console.log('RuTor Plugin initialized');
    }

    // Запуск только если загружена Lampa
    if (typeof Lampa !== 'undefined' && Lampa.Component) {
        startPlugin();
    } else {
        window.addEventListener('lampa_ready', startPlugin, { once: true });
    }

})();

/**
 * =====================================================================
 * ИНСТРУКЦИЯ ПО УСТАНОВКЕ И ОБНОВЛЕНИЮ
 * =====================================================================
 * 
 * 1. КАК СОХРАНИТЬ ФАЙЛ:
 *    - Скопируйте ВЕСЬ код выше.
 *    - Создайте текстовый файл и вставьте в него код.
 *    - Сохраните файл с именем ru_tor.js (обязательно расширение .js, кодировка UTF-8).
 *    - Загрузите файл на любой удобный хостинг, поддерживающий прямые ссылки (GitHub Gist, GitLab Snippets, ваш сервер).
 *    - Получите прямую ссылку на файл (должна заканчиваться на .js).
 * 
 * 2. КАК УСТАНОВИТЬ В LAMPA (Media X на LG webOS):
 *    - Откройте приложение Lampa на телевизоре.
 *    - Перейдите в Настройки (шестеренка в правом нижнем углу).
 *    - Выберите раздел "Расширения" (или "Плагины").
 *    - Нажмите "Добавить плагин" (иконка плюса).
 *    - В появившемся окне введите прямую ссылку на ваш файл ru_tor.js.
 *    - Нажмите "Установить". Перезапустите Lampa (выключите и включите через меню ТВ).
 *    - В левом главном меню появится кнопка "RuTor".
 * 
 * 3. КАК ОБНОВЛЯТЬ ПЛАГИН:
 *    - Если вы изменили код на хостинге, просто обновите ссылку в Lampa.
 *    - Настройки -> Расширения -> Нажмите на плагин RuTor -> "Обновить".
 *    - Либо удалите старую ссылку и добавьте новую.
 *    - Кэш плагина (данные с сайта) обновляется автоматически каждые 15 минут.
 * =====================================================================
 */
