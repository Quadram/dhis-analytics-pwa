// Set this to true for production
var doCache = true;

// Name our cache
var CACHE_NAME = 'dhis2-cache-v1';
var DATA_CACHE_NAME = 'dhis2-data-cache-v1';

var INDEXEDDB_NAME = 'dhis2-dashboard-data';
var db;

// Delete old caches that are not our current one!
self.addEventListener('activate', event => {
    console.log(
        '%c [Service Worker] Activating SW ',
        'background: #aaa; color: #fff'
    );
    const cacheWhitelist = [CACHE_NAME, DATA_CACHE_NAME];
    event.waitUntil(
        caches.keys().then(keyList =>
            Promise.all(
                keyList.map(key => {
                    if (!cacheWhitelist.includes(key)) {
                        console.log(
                            '%c [Service Worker] Deleting cache: ' + key,
                            'background: #aaa; color: #fff'
                        );
                        return caches.delete(key);
                    }
                })
            )
        )
    );
});

// The first time the user starts up the PWA, 'install' is triggered.
self.addEventListener('install', function(event) {
    console.log(
        '%c [Service Worker] Installing SW ',
        'background: #aaa; color: #fff'
    );
    if (doCache) {
        event.waitUntil(
            caches.open(CACHE_NAME).then(function(cache) {
                // Get the assets manifest so we can see what our js file is name
                // This is because webpack hashes it
                fetch('asset-manifest.json')
                    .then(response => {
                        response.json();
                    })
                    .then(assets => {
                        // Open a cache and cache our files
                        // We want to cache the page and the main.js generated by webpack
                        // We could also cache any static assets like CSS or images
                        const urlsToCache = [
                            '/',
                            '/index.html',
                            '/favicon.ico',
                            '/manifest.json',
                            assets['main.js'],
                            assets['main.js.map'],
                            assets['main.css'],
                            assets['main.css.map'],
                            assets['static/media/MaterialIcons-Regular.eot'],
                            assets['static/media/MaterialIcons-Regular.ttf'],
                            assets['static/media/MaterialIcons-Regular.woff'],
                            assets['static/media/MaterialIcons-Regular.woff2'],
                        ];
                        cache.addAll(urlsToCache);
                        console.log(
                            '%c [Service Worker] Listed Files Cached ',
                            'background: #aaa; color: #fff'
                        );
                    });
            })
        );
    }
});

// When the webpage goes to fetch files, we intercept that request and serve up the matching files
// if we have them
self.addEventListener('fetch', function(event) {
    if (
        doCache &&
        event.request.url.indexOf('http') === 0 &&
        !(event.request.method === 'POST')
    ) {
        console.log(
            '%c [Service Worker] Fetch [' + event.request.url + '] ',
            'background: #aaa; color: #fff'
        );
        event.respondWith(
            (async function() {
                if (self.indexedDB) {
                    let cacheResponse = null;
                    caches.match(event.request).then(function(response) {
                        if (response) {
                            console.log(
                                '%c FILE FROM CACHE => ' +
                                    event.request.url +
                                    ' [' +
                                    !!response +
                                    '] ',
                                'background: #0f0; color: #000'
                            );
                            cacheResponse = response;
                        }
                    });
                    const networkResponse = await fetch(event.request).catch(
                        () => {
                            console.log(
                                '%c NO INTERNEEEEEEEETTT ',
                                'background: #f00; color: #000'
                            );
                        }
                    );
                    if (networkResponse) {
                        console.log(
                            '%c HAY NETWORK RESPONSE ',
                            'background: #0f0; color: #000'
                        );
                        if (cacheResponse) {
                            const cache = await caches.open(CACHE_NAME);
                            event.waitUntil(
                                cache.put(
                                    event.request,
                                    networkResponse.clone()
                                )
                            );
                        } else {
                            event.waitUntil(
                                setKey(
                                    event.request.url,
                                    networkResponse.clone(),
                                    event
                                )
                            );
                        }
                    }
                    console.log(
                        '%c Get data from DB ',
                        'background: #00b6ff; color: #fff'
                    );
                    const DBResponse = await getKey(event.request.url);
                    if (!cacheResponse) {
                        if (DBResponse) {
                            console.log(
                                '%c DATA FROM DB AVAILABLE [' +
                                    event.request.url +
                                    '] ',
                                'background: #0f0; color: #000'
                            );
                        } else {
                            console.log(
                                '%c THERE IS NO DATA FROM DB [' +
                                    event.request.url +
                                    '] ',
                                'background: #f00; color: #ff0'
                            );
                        }
                    } else {
                        console.log(
                            '%c DATA FROM CACHE AVAILABLE [' +
                                event.request.url +
                                '] ',
                            'background: #0f0; color: #000'
                        );
                    }
                    console.log(
                        '%cXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                        'background: #000; color: #fff'
                    );
                    return networkResponse || DBResponse || cacheResponse;
                } else {
                    console.log(
                        '%c INDEXED_DB NOT SUPPORTED ',
                        'background: #b600ff; color: #fff'
                    );
                    return cacheStore(DATA_CACHE_NAME, event);
                }
            })()
        );
    }
});

function getDB() {
    if (!db) {
        console.log(
            '%c Creating IndexedDB ',
            'background: #00b6ff; color: #fff'
        );
        db = new Promise((resolve, reject) => {
            var openDB = indexedDB.open(INDEXEDDB_NAME, 1);

            openDB.onerror = () => {
                reject(openDB.error);
            };

            openDB.onupgradeneeded = () => {
                // First time setup: create an empty object store
                openDB.result.createObjectStore('dhis2');
            };

            openDB.onsuccess = () => {
                resolve(openDB.result);
            };
        });
    }
    return db;
}

async function withStore(type, callback) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('dhis2', type);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        callback(transaction.objectStore('dhis2'));
    });
}

async function getKey(key) {
    let req;
    console.log('%c READING DATA... ', 'background: #ff0; color: #000');
    await withStore('readonly', store => {
        req = store.get(key);
    });
    return req.result;
}

async function setKey(key, value, event) {
    console.log('%c SETTING DATA... ', 'background: #ff0; color: #000');
    return new Promise(resolve => {
        value
            .clone()
            .json()
            .then(data => {
                console.log('DATA: ', data);
                console.log(
                    '%c Tenemos JSON ',
                    'background: #0f0; color: #000'
                );
                let tx = withStore('readwrite', store => {
                    store.put(data, key);
                });
                if (tx.complete) {
                    console.log('DATA STORED', 'background: #0f0; color: #000');
                }
                resolve(tx.complete);
            })
            .catch(
                caches.open(CACHE_NAME).then(cache => {
                    resolve(cache.put(event.request, value.clone()));
                })
            );
    });
}

function deleteKey(key) {
    return withStore('readwrite', store => {
        store.delete(key);
    });
}

async function cacheStore(cacheName, event) {
    const cache = await caches.open(cacheName);
    const networkResponse = await fetch(event.request).catch(() => {
        console.log(
            '%c NO INTERNEEEEEEEETTT ',
            'background: #f00; color: #000'
        );
    });

    if (networkResponse) {
        event.waitUntil(cache.put(event.request, networkResponse.clone()));
    }

    const cachedResponse = await cache.match(event.request);
    return networkResponse || cachedResponse;
}
