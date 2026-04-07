/**
 * Плагин Rutor Browse для Lampa TV
 * Формат: IIFE (чистый JavaScript)
 */
(function () {
    'use strict';

    // Конфигурация
    const PLUGIN_NAME = 'RuTor Бrowse';
    const PROXY_URL = 'https://api.allorigins.win/raw?url='; // CORS прокси для обхода ограничений браузера TV

    // Категории (соответствуют структуре rutor.info)
    const CATEGORIES = [
        { title: 'Топ торренты за 24 часа', url: '/top' },
        { title: 'Зарубежные фильмы', url: '/0/0/0/0/2' },
        { title: 'Наши фильмы', url: '/0/0/0/0/4' },
        { title: 'Зарубежные сериалы', url: '/0/0/0/0/5' },
        { title: 'Наши сериалы', url: '/0/0/0/0/6' },
        { title: 'Телевизор', url: '/0/0/0/0/16' }
    ];

    // SVG Иконка для меню (Магнит)
    const SVG_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 8C4 5.79086 5.79086 4 8 4H10V2H14V4H16C18.2091 4 20 5.79086 20 8V10H22V14H20V16C20 18.2091 18.2091 20 16 20H8C5.79086 20 4 18.2091 4 16V14H2V10H4V8Z" stroke="currentColor" stroke-width="2"/>
        <path d="M10 10V14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 10V14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 14L12 17L15 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    // --- УТИЛИТЫ ---

    // Очистка названия от лишнего мусора (годы, качество, размер) для точного поиска в Lampa
    function cleanTitleForSearch(rawTitle) {
        let title = rawTitle
            .replace(/[\[\(].*?[\]\)]/g, '') // Удаляем всё в скобках (например, (Пиратская версия))
            .replace(/\/\s*[^\/]+\s*$/, '')  // Удаляем режиссера после последнего слеша
            .replace(/\s*(HDRip|BDRip|BluRay|WEB-DLRip|WEBRip|HDTV|CAMRip|TS|DVDScr|1080p|720p|2160p|4K|ТРК|Фильм|Сериал|Видео|PC|PS4|Xbox).*$/i, '') // Удаляем качество и форматы
            .replace(/\s*\d{4}\s*$/, '')     // Удаляем год в конце
            .replace(/^\s+|\s+$/gm, '')      // Убираем пробелы по краям
            .trim();
            
        // Если после очистки ничего не осталось, возвращаем оригинал
        return title.length > 3 ? title : rawTitle;
    }

    // --- ИНТЕРФЕЙС (Отрисовка списков через API Lampa) ---

    function showCategories() {
        Lampa.Activity.push({
            url: '',
            title: PLUGIN_NAME,
            component: 'rutor_categories',
            page: 1
        });
    }

    function renderCategories(body, component) {
        Lampa.Background.immediately('https://rutor.info/images/logo.png'); // Фон
        
        const scroll = new Lampa.Scroll({ horizontal: false });
        const items = [];

        CATEGORIES.forEach((cat, index) => {
            const item = document.createElement('div');
            item.className = 'simple-item selector';
            item.innerHTML = `
                <div class="simple-item-icon">${SVG_ICON}</div>
                <div class="simple-item-text">${cat.title}</div>
            `;
            
            item.on('hover:focus', () => {
                component.toggle(item);
            });
            
            item.on('hover:enter', () => {
                Lampa.Activity.push({
                    url: cat.url,
                    title: cat.title,
                    component: 'rutor_items',
                    page: 1
                });
            });

            items.push(item);
        });

        body.append(scroll.render());
        scroll.append(items);
        component.append(scroll.render());
        component.toggle(items[0]);
    }

    function renderTorrents(body, component, url, pageTitle) {
        Lampa.Background.immediately('https://rutor.info/images/logo.png');
        component.empty();
        component.loading(true);

        const targetUrl = PROXY_URL + encodeURIComponent('https://rutor.info' + url);

        fetch(targetUrl)
            .then(response => {
                if (!response.ok) throw new Error('Network error');
                return response.text();
            })
            .then(html => {
                component.loading(false);
                parseAndRender(html, body, component, url);
            })
            .catch(err => {
                component.loading(false);
                Lampa.Noty.show('Ошибка загрузки RuTor. Проверьте интернет или CORS-прокси.');
                console.error('RuTor Plugin Error:', err);
            });
    }

    function parseAndRender(html, body, component, currentUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('table tr');
        
        const scroll = new Lampa.Scroll({ horizontal: false });
        const items = [];

        // Улучшенный парсинг: ищем строки с классом 'g' (зеленые заголовки) и Magnet
        rows.forEach(row => {
            const titleCell = row.querySelector('td.g');
            const magnetLink = row.querySelector('a[href^="magnet:?"]');
            const sizeCell = row.querySelector('td.s');
            const seedCell = row.querySelector('td.sp');

            if (titleCell && magnetLink) {
                const titleAnchor = titleCell.querySelector('a');
                if (!titleAnchor) return;

                const rawTitle = titleAnchor.textContent.trim();
                const magnet = magnetLink.getAttribute('href');
                const size = sizeCell ? sizeCell.textContent.trim() : '';
                const seeds = seedCell ? parseInt(seedCell.textContent.trim()) : 0;

                const item = document.createElement('div');
                item.className = 'simple-item selector';
                
                // Цвет сидов для наглядности
                const seedColor = seeds > 50 ? '#4caf50' : (seeds > 10 ? '#ffeb3b' : '#ff5722');

                item.innerHTML = `
                    <div class="simple-item-icon">
                        <span style="color: ${seedColor}; font-weight: bold; font-size: 14px;">${seeds}</span>
                    </div>
                    <div class="simple-item-text">
                        <div style="margin-bottom: 4px;">${rawTitle}</div>
                        <div style="color: #888; font-size: 13px;">${size} | Magnet готов</div>
                    </div>
                `;

                item.on('hover:focus', () => {
                    component.toggle(item);
                });

                item.on('hover:enter', () => {
                    handleTorrentSelect(rawTitle, magnet);
                });

                items.push(item);
            }
        });

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-layer';
            empty.innerHTML = '<div class="empty-title">Список пуст</div>';
            body.append(empty);
        } else {
            body.append(scroll.render());
            scroll.append(items);
            component.toggle(items[0]);
        }

        // Пагинация (если есть)
        const nextPages = doc.querySelectorAll('#index a');
        let nextPageUrl = null;
        nextPages.forEach(a => {
            if (a.textContent.trim() === '← сюда' || a.href.includes('/0/5') || a.href.includes('/0/9')) {
                // Простейшая логика пагинации (зависит от структуры rutor)
            }
        });
    }

    // --- ОБРАБОТКА ВЫБОРА (Интеграция с парсерами Lampa) ---
    
    function handleTorrentSelect(rawTitle, magnet) {
        // Убираем мусор для идеального поиска
        const searchQuery = cleanTitleForSearch(rawTitle);
        
        Lampa.Noty.show('Поиск источников для: ' + searchQuery);

        // Сохраняем магнит во временное хранилище (на случай, если в Lampa есть кастомные парсеры, 
        // которые умеют читать из Lampa.Storage напрямую по ключу)
        Lampa.Storage.set('rutor_last_magnet', magnet);

        // ИСПОЛЬЗУЕМ РОДНОЙ ПОИСК LAMPA
        // Это единственный способ заставить "Lampa сама найти источники, показать парсеры, дать выбрать качество"
        Lampa.Activity.push({
            search: searchQuery,
            search_one: rawTitle, // Запасное поле
            object: {
                source: 'rutor_plugin'
            },
            component: 'search'
        });
    }

    // --- РЕГИСТРАЦИЯ КОМПОНЕНТОВ В LAMPA ---

    // Компонент категорий
    Lampa.Component.add('rutor_categories', function (params) {
        const component = this;
        const body = document.createElement('div');
        body.className = 'layer--wheight';

        component.create = function () {
            Lampa.Layer.build(body);
            Lampa.Layer.update(body);
            component.render();
        };

        component.render = function () {
            renderCategories(body, component);
        };

        component.toggle = function () {};

        component.destroy = function () {
            body.remove();
            Lampa.Layer.destroy(body);
        };
    });

    // Компонент списка торрентов
    Lampa.Component.add('rutor_items', function (params) {
        const component = this;
        const body = document.createElement('div');
        body.className = 'layer--wheight';

        component.create = function () {
            Lampa.Layer.build(body);
            Lampa.Layer.update(body);
            component.render();
        };

        component.render = function () {
            renderTorrents(body, component, params.url, params.title);
        };

        component.toggle = function () {};

        component.destroy = function () {
            body.remove();
            Lampa.Layer.destroy(body);
        };
    });

    // --- ДОБАВЛЕНИЕ КНОПКИ В ЛЕВОЕ МЕНЮ ---
    
    if (Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('menu', function (e) {
            if (e.type === 'build') {
                e.object.items.push({
                    title: PLUGIN_NAME,
                    icon: SVG_ICON,
                    onSelect: function () {
                        showCategories();
                    }
                });
            }
        });
    }

    console.log('Plugin "' + PLUGIN_NAME + '" loaded successfully');

})();
