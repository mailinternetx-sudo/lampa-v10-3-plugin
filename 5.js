(function () {
    'use strict';

    console.log('[RUTOR] plugin start');

    var plugin = {
        name: 'rutor_plugin',
        version: '1.0.0',
        description: 'Rutor torrents for Lampa'
    };

    var categories = [
        { name: '🔥 Топ за 24 часа', url: 'https://rutor.info/top' },
        { name: '🎬 Зарубежные фильмы', url: 'https://rutor.info/browse/1/0/0/0' },
        { name: '🎥 Наши фильмы', url: 'https://rutor.info/browse/5/0/0/0' },
        { name: '📺 Зарубежные сериалы', url: 'https://rutor.info/browse/4/0/0/0' },
        { name: '📺 Наши сериалы', url: 'https://rutor.info/browse/6/0/0/0' },
        { name: '📡 ТВ', url: 'https://rutor.info/browse/7/0/0/0' }
    ];

    function parseHTML(html) {
        var parser = new DOMParser();
        return parser.parseFromString(html, 'text/html');
    }

    function extractMagnet(row) {
        var link = row.querySelector('a[href^="magnet:"]');
        return link ? link.getAttribute('href') : null;
    }

    function extractTitle(row) {
        var link = row.querySelector('a[href^="/torrent/"]');
        return link ? link.textContent.trim() : 'Без названия';
    }

    function extractSize(row) {
        var sizeCell = row.querySelectorAll('td')[3];
        return sizeCell ? sizeCell.textContent.trim() : '';
    }

    function buildMovie(item, index) {
        return {
            id: 'rutor_' + index,
            title: item.title,
            original_title: item.title,
            overview: 'Размер: ' + item.size,
            poster_path: '',
            backdrop_path: '',
            magnet: item.magnet,
            source: 'torrent',
            torrserver: true
        };
    }

    function loadRutor(url, callback) {
        console.log('[RUTOR] loading:', url);

        fetch(url)
            .then(function (res) { return res.text(); })
            .then(function (html) {
                var doc = parseHTML(html);
                var rows = doc.querySelectorAll('tr.gai, tr.tum');

                var list = [];

                rows.forEach(function (row, i) {
                    var magnet = extractMagnet(row);
                    if (!magnet) return;

                    list.push({
                        title: extractTitle(row),
                        magnet: magnet,
                        size: extractSize(row)
                    });
                });

                if (!list.length) throw 'empty';

                callback(list);
            })
            .catch(function () {
                console.warn('[RUTOR] fallback used');

                callback([
                    {
                        title: 'Fallback фильм (пример)',
                        magnet: 'magnet:?xt=urn:btih:EXAMPLE',
                        size: '1.4 GB'
                    }
                ]);
            });
    }

    function openCategory(cat) {
        Lampa.Activity.push({
            url: cat.url,
            title: cat.name,
            component: 'rutor_category',
            page: 1
        });
    }

    function openMovie(movie) {
        console.log('[RUTOR] open movie', movie);

        Lampa.Activity.push({
            component: 'torrent',
            title: movie.title,
            url: movie.magnet,
            torrent: movie.magnet,
            info: movie
        });
    }

    function CategoryComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var body = $('<div></div>');

        this.create = function () {
            this.activity.loader(true);

            loadRutor(object.url, function (items) {
                body.empty();

                items.forEach(function (item, index) {
                    var movie = buildMovie(item, index);

                    var card = $('<div class="card"></div>');
                    card.text(movie.title);

                    card.on('hover:enter', function () {
                        openMovie(movie);
                    });

                    body.append(card);
                });

                scroll.append(body);
                this.activity.loader(false);
            }.bind(this));

            return scroll.render();
        };

        this.destroy = function () {
            scroll.destroy();
        };
    }

    function MainComponent() {
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var body = $('<div></div>');

        this.create = function () {
            categories.forEach(function (cat) {
                var item = $('<div class="menu-item"></div>');
                item.text(cat.name);

                item.on('hover:enter', function () {
                    openCategory(cat);
                });

                body.append(item);
            });

            scroll.append(body);
            return scroll.render();
        };

        this.destroy = function () {
            scroll.destroy();
        };
    }

    function addMenu() {
        Lampa.Template.add('rutor_icon', `
            <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12 2L2 7v7c0 5 3.8 9.7 10 12c6.2-2.3 10-7 10-12V7l-10-5z"/>
            </svg>
        `);

        Lampa.Menu.add({
            title: 'Rutor',
            icon: Lampa.Template.get('rutor_icon'),
            component: 'rutor_main'
        });
    }

    function start() {
        Lampa.Component.add('rutor_main', MainComponent);
        Lampa.Component.add('rutor_category', CategoryComponent);

        addMenu();

        console.log('[RUTOR] plugin ready');
    }

    if (window.Lampa) start();
    else {
        window.addEventListener('lampa', start);
    }

})();
