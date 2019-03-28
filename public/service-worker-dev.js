// Set this to true for production
var doCache = true;

// Name our cache
var CACHE_NAME = 'dhis2-cache-v1';
var DATA_CACHE_NAME = 'dhis2-data-cache-v1';

var filesToCache = ['/', '/index.html', '/favicon.ico', '/manifest.json'];

var INDEXEDDB_NAME = 'dhis2-dashboard-data';
var db;
var useIndexDB = false;

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
                // fetch('asset-manifest.json')
                //     .then(response => {
                //         response.json();
                //     })
                //     .then(assets => {
                // Open a cache and cache our files
                // We want to cache the page and the main.js generated by webpack
                // We could also cache any static assets like CSS or images
                // const urlsToCache = ['/', assets['main.js']];
                const urlsToCache = [
                    'static/js/bundle.js',
                    'static/js/bundle.js.map',
                    'static/media/MaterialIcons-Regular.570eb838.woff2',
                ]; //No borra los anteriores
                filesToCache = filesToCache.concat(urlsToCache);
                cache.addAll(filesToCache);
                console.log(
                    '%c [Service Worker] Listed Files Cached ',
                    'background: #aaa; color: #fff'
                );
            })
        );
    }
});

// When the webpage goes to fetch files, we intercept that request and serve up the matching files
// if we have them
self.addEventListener('fetch', event => {
    console.log('WORKER: fetch event in progress.');

    /* We should only cache GET requests, and deal with the rest of method in the
       client-side, by handling failed POST,PUT,PATCH,etc. requests.
    */
    if (event.request.method !== 'GET') {
        /* If we don't block the event as shown below, then the request will go to
           the network as usual.
        */
        console.log(
            'WORKER: fetch event ignored.',
            event.request.method,
            event.request.url
        );
        return;
    }
    /* Similar to event.waitUntil in that it blocks the fetch event on a promise.
       Fulfillment result will be used as the response, and rejection will end in a
       HTTP response indicating failure.
    */
    event.respondWith(
        caches
            /* This method returns a promise that resolves to a cache entry matching
           the request. Once the promise is settled, we can then provide a response
           to the fetch request.
        */
            .match(event.request)
            .then(function(cached) {
                /* Even if the response is in our cache, we go to the network as well.
                   This pattern is known for producing "eventually fresh" responses,
                   where we return cached responses immediately, and meanwhile pull
                   a network response and store that in the cache.
                   Read more:
                   https://ponyfoo.com/articles/progressive-networking-serviceworker
                */
                let networked = fetch(event.request)
                    // We handle the network request with success and failure scenarios.
                    .then(fetchedFromNetwork, unableToResolve)
                    // We should catch errors on the fetchedFromNetwork handler as well.
                    .catch(unableToResolve);

                /* We return the cached response immediately if there is one, and fall
                   back to waiting on the network as usual.
                */
                console.log(
                    'WORKER: fetch event',
                    cached ? '(cached)' : '(network)',
                    event.request.url
                );
                return cached || networked;

                function fetchedFromNetwork(response) {
                    /* We copy the response before replying to the network request.
                       This is the response that will be stored on the ServiceWorker cache.
                    */
                    let cacheCopy = response.clone();

                    console.log(
                        'WORKER: fetch response from network.',
                        event.request.url
                    );

                    saveResponseToCache(event, cacheCopy);

                    // Return the response so that the promise is settled in fulfillment.
                    return response;
                }

                /* When this method is called, it means we were unable to produce a response
                   from either the cache or the network. This is our opportunity to produce
                   a meaningful response even when all else fails. It's the last chance, so
                   you probably want to display a "Service Unavailable" view or a generic
                   error response.
                */
                function unableToResolve() {
                    /* There's a couple of things we can do here.
                       - Test the Accept header and then return one of the `offlineFundamentals`
                         e.g: `return caches.match('/some/cached/image.png')`
                       - You should also consider the origin. It's easier to decide what
                         "unavailable" means for requests against your origins than for requests
                         against a third party, such as an ad provider
                       - Generate a Response programmaticaly, as shown below, and return that
                    */

                    console.log(
                        'WORKER: fetch request failed in both cache and network.'
                    );

                    /* Here we're creating a response programmatically. The first parameter is the
                       response body, and the second one defines the options for the response.
                    */
                    return new Response('<h1>Service Unavailable</h1>', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/html',
                        }),
                    });
                }
            })
    );
});

async function saveResponseToCache(event, cacheCopy) {
    if (useIndexDB && self.indexedDB) {
        console.log('guardando respuesta en indexedDB', event.request.url);
        await setKey(event.request.url, cacheCopy.clone(), event);
    } else {
        console.log('guardando respuesta en CACHE', event.request.url);
        caches
            // We open a cache to store the response for this request.
            .open(DATA_CACHE_NAME)
            .then(function add(cache) {
                /* We store the response for this request. It'll later become
               available to caches.match(event.request) calls, when looking
               for cached responses.
            */
                cache.put(event.request, cacheCopy);
            })
            .then(function() {
                console.log(
                    'WORKER: fetch response stored in cache.',
                    event.request.url
                );
            });
    }
}

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
    return new Promise((resolve, reject) => {
        withStore('readonly', store => {
            req = store.get(key);
        }).then(() => {
            resolve(req.result);
        });
    });
}

async function setKey(key, value, event) {
    console.log('%c SETTING DATA... ', 'background: #ff0; color: #000');
    let dataToStore = value.clone();
    return new Promise((resolve, reject) => {
        dataToStore
            .json()
            .then(data => {
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
            .catch(error => {
                caches
                    .open(CACHE_NAME)
                    .then(cache => {
                        resolve(cache.put(event.request, value));
                    })
                    .catch(error => {
                        reject();
                    });
            });
    });
}

function deleteKey(key) {
    return withStore('readwrite', store => {
        store.delete(key);
    });
}
