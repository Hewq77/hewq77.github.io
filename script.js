document.addEventListener('DOMContentLoaded', function() {
    const currentYear = document.getElementById('current-year');
    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) {
        const d = new Date(document.lastModified);
        lastUpdated.textContent = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    setupMobileMenu();
    setupSmoothScroll();
    setupNavHighlight();
    makeAllLinksOpenInNewTab();
    setupLinkObserver();
    initThemeToggle();
    loadScholarStats();

    loadNews();
    loadHonors();
    loadPublications();
});

// ==================== Theme Toggle ====================
function initThemeToggle() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    const toggleBtns = document.querySelectorAll('#theme-toggle, #theme-toggle-mobile');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    });
}

// ==================== Google Scholar Citations ====================
function loadScholarStats() {
    const badgeEl = document.getElementById('scholar-badge-citations');
    const citationsEl = badgeEl ? badgeEl.querySelector('.scholar-badge-value') : null;

    if (!badgeEl || !citationsEl) return;

    const scholarId = badgeEl.dataset.scholarId || 'tMZ30p8AAAAJ';
    const fallbackCitations = parseCitationNumber(badgeEl.dataset.fallbackCitations || citationsEl.textContent);
    const fallbackUpdated = badgeEl.dataset.fallbackUpdated || '';
    let hasDisplayedValue = renderScholarCitations(citationsEl, fallbackCitations, {
        updated: fallbackUpdated,
        source: 'Cached Google Scholar'
    });

    const storedStats = getStoredScholarStats(scholarId);
    if (storedStats) {
        hasDisplayedValue = renderScholarCitations(citationsEl, storedStats, {
            updated: storedStats.updated,
            source: storedStats.source || 'Cached Google Scholar'
        }) || hasDisplayedValue;
    }

    if (!hasDisplayedValue) {
        citationsEl.classList.add('loading');
    }
    badgeEl.setAttribute('aria-busy', 'true');

    fetchLocalScholarStats()
        .then(stats => {
            if (stats && stats.scholarId === scholarId) {
                hasDisplayedValue = renderScholarCitations(citationsEl, stats, {
                    updated: stats.updated,
                    source: stats.source || 'Cached Google Scholar'
                }) || hasDisplayedValue;
                storeScholarStats(scholarId, stats);
            }
        })
        .catch(error => {
            console.warn('Scholar cache load failed:', error);
        })
        .finally(() => {
            fetchLiveGoogleScholarCitations(scholarId)
                .then(citations => {
                    const stats = {
                        scholarId,
                        citations,
                        updated: new Date().toISOString(),
                        source: 'Google Scholar'
                    };

                    hasDisplayedValue = renderScholarCitations(citationsEl, stats, {
                        animate: true,
                        updated: stats.updated,
                        source: stats.source
                    }) || hasDisplayedValue;
                    storeScholarStats(scholarId, stats);
                })
                .catch(error => {
                    console.warn('Scholar live refresh failed:', error);
                })
                .finally(() => {
                    badgeEl.removeAttribute('aria-busy');
                    citationsEl.classList.remove('loading');
                    if (!hasDisplayedValue && !hasRenderedScholarValue(citationsEl)) {
                        showScholarError(citationsEl);
                    }
                });
        });
}

function fetchLocalScholarStats() {
    return fetch(getDataPath('scholar-stats.json'), { cache: 'no-store' })
        .then(handleJsonResponse)
        .then(normalizeScholarStats);
}

function fetchLiveGoogleScholarCitations(scholarId) {
    const scholarUrl = 'https://scholar.google.com/citations?user=' + scholarId + '&hl=en';
    const proxies = [
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(scholarUrl),
        'https://corsproxy.io/?' + encodeURIComponent(scholarUrl),
        'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(scholarUrl)
    ];

    return fetchWithFallback(proxies)
        .then(html => {
            const citations = parseScholarCitations(html);
            if (citations === null) {
                throw new Error('Could not parse Google Scholar citations');
            }
            return citations;
        });
}

function fetchWithFallback(urls) {
    return urls.reduce((promise, url) => {
        return promise.catch(() => fetchTextWithTimeout(url, 8000));
    }, Promise.reject());
}

function fetchTextWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { signal: controller.signal })
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .finally(() => {
            clearTimeout(timeout);
        });
}

function normalizeScholarStats(data) {
    if (!data) return null;

    const citations = parseCitationNumber(data.citations ?? data.citationCount ?? data.totalCitations);
    if (citations === null) return null;

    return {
        scholarId: data.scholarId || 'tMZ30p8AAAAJ',
        citations,
        updated: data.updated || data.lastUpdated || '',
        source: data.source || 'Cached Google Scholar'
    };
}

function parseCitationNumber(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/\d+/);
    if (!match) return null;

    const parsed = parseInt(match[0], 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function renderScholarCitations(el, statsOrNumber, options = {}) {
    if (!el) return false;

    const stats = typeof statsOrNumber === 'object'
        ? normalizeScholarStats(statsOrNumber)
        : normalizeScholarStats({ citations: statsOrNumber });

    if (!stats) return false;

    el.classList.remove('loading');
    if (options.animate) {
        animateCount(el, stats.citations);
    } else {
        el.textContent = stats.citations.toLocaleString();
    }

    updateScholarTitle(el, {
        updated: options.updated || stats.updated,
        source: options.source || stats.source
    });

    return true;
}

function updateScholarTitle(el, stats = {}) {
    const link = el.closest('.scholar-badge-link');
    if (!link) return;

    const parts = [stats.source || 'Google Scholar citations'];
    if (stats.updated) {
        parts.push('updated ' + formatScholarDate(stats.updated));
    }
    link.title = parts.join(', ');
}

function formatScholarDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

function hasRenderedScholarValue(el) {
    return parseCitationNumber(el ? el.textContent : '') !== null;
}

function getStoredScholarStats(scholarId) {
    try {
        return normalizeScholarStats(JSON.parse(localStorage.getItem(getScholarStorageKey(scholarId))));
    } catch (e) {
        return null;
    }
}

function storeScholarStats(scholarId, stats) {
    try {
        localStorage.setItem(getScholarStorageKey(scholarId), JSON.stringify(stats));
    } catch (e) {
        // Local storage may be unavailable in private browsing or strict environments.
    }
}

function getScholarStorageKey(scholarId) {
    return 'scholarStats:' + scholarId;
}

function parseScholarCitations(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Method 1: table cells
        const cells = doc.querySelectorAll('#gsc_rsb_st td.gsc_rsb_std');
        if (cells.length >= 1) {
            const val = parseInt(cells[0].textContent.replace(/\D/g, ''), 10);
            if (!isNaN(val)) return val;
        }

        // Method 2: all .gsc_rsb_std cells
        const allCells = doc.querySelectorAll('.gsc_rsb_std');
        if (allCells.length >= 1) {
            const val = parseInt(allCells[0].textContent.replace(/\D/g, ''), 10);
            if (!isNaN(val)) return val;
        }

        // Method 3: regex fallback on raw HTML
        const match = html.match(/Citations<\/a>\s*<\/td>\s*<td[^>]*class="[^"]*gsc_rsb_std[^"]*"[^>]*>(\d[\d,]*)/i);
        if (match) {
            return parseInt(match[1].replace(/,/g, ''), 10);
        }

        // Method 4: broader regex
        const match2 = html.match(/gsc_rsb_std[^>]*>\s*(\d[\d,]*)\s*<\/td>/i);
        if (match2) {
            return parseInt(match2[1].replace(/,/g, ''), 10);
        }
    } catch (e) {
        console.warn('Scholar parse error:', e);
    }
    return null;
}

function animateCount(el, target) {
    if (!el) return;
    el.classList.remove('loading');

    const duration = 800;
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased).toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function showScholarError(citationsEl) {
    if (citationsEl) {
        citationsEl.classList.remove('loading');
        citationsEl.textContent = '-';
    }
}

function setupMobileMenu() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (!mobileMenuBtn || !mobileMenu) {
        return;
    }

    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
        });
    });
}

function setupSmoothScroll() {
    const navLinks = document.querySelectorAll('.nav-links a, .mobile-menu a');

    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            const href = this.getAttribute('href');
            if (!href || !href.startsWith('#')) {
                return;
            }

            const target = document.querySelector(href);
            if (!target) {
                return;
            }

            event.preventDefault();
            const nav = document.querySelector('.top-nav');
            const navHeight = nav ? nav.offsetHeight : 0;
            const top = target.offsetTop - navHeight - 20;

            window.scrollTo({
                top,
                behavior: 'smooth'
            });
        });
    });
}

function setupNavHighlight() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const sections = document.querySelectorAll('section[id]');
    const nav = document.querySelector('.top-nav');

    if (!navLinks.length || !sections.length || !nav) {
        return;
    }

    window.addEventListener('scroll', () => {
        let current = '';
        const navHeight = nav.offsetHeight;

        sections.forEach(section => {
            if (window.pageYOffset >= section.offsetTop - navHeight - 100) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            const target = (link.getAttribute('href') || '').replace('#', '');
            if (target === current || (current === 'homepage' && target === 'about')) {
                link.classList.add('active');
            }
        });
    });
}

function loadNews() {
    const homeContainer = document.getElementById('news-container');
    const allContainer = document.getElementById('all-news-container');

    if (!homeContainer && !allContainer) {
        return;
    }

    fetch(getDataPath('news.json'))
        .then(handleJsonResponse)
        .then(items => {
            if (homeContainer) {
                renderNewsItems(items.slice(0, 8), homeContainer);
            }
            if (allContainer) {
                renderNewsItems(items, allContainer);
            }
        })
        .catch(error => {
            console.error('Error loading news data:', error);
        });
}

function loadHonors() {
    const homeContainer = document.getElementById('honors-container');
    const allContainer = document.getElementById('all-honors-container');

    if (!homeContainer && !allContainer) {
        return;
    }

    fetch(getDataPath('honors.json'))
        .then(handleJsonResponse)
        .then(items => {
            if (homeContainer) {
                renderHonorsItems(items.slice(0, 8), homeContainer);
            }
            if (allContainer) {
                renderHonorsItems(items, allContainer);
            }
        })
        .catch(error => {
            console.error('Error loading honors data:', error);
        });
}

function loadPublications() {
    const featuredContainer = document.getElementById('featured-publications-container');
    const allContainer = document.getElementById('all-publications-container');

    if (!featuredContainer && !allContainer) {
        return;
    }

    fetch(getDataPath('publications.json'))
        .then(handleJsonResponse)
        .then(publications => {
            if (featuredContainer) {
                const featured = publications
                    .sort(compareFeaturedPublications);
                renderFeaturedPublications(featuredContainer, featured);
            }

            if (allContainer) {
                renderAllPublicationsPage(allContainer, publications);
            }
        })
        .catch(error => {
            console.error('Error loading publications data:', error);
            const container = featuredContainer || allContainer;
            if (container) {
                container.innerHTML = '<p>Failed to load publications.</p>';
            }
        });
}

function renderFeaturedPublications(container, publications) {
    container.innerHTML = '';

    if (!publications.length) {
        container.innerHTML = '<p>No featured publications available.</p>';
        return;
    }

    const grouped = new Map();

    publications
        .slice()
        .sort(compareAllPublications)
        .forEach(pub => {
            const yearLabel = getYearLabel(pub);
            if (!grouped.has(yearLabel)) {
                grouped.set(yearLabel, []);
            }
            grouped.get(yearLabel).push(pub);
        });

    Array.from(grouped.entries()).forEach(([year, items]) => {
        const group = document.createElement('div');
        group.className = 'pub-year-group';

        const header = document.createElement('h3');
        header.className = 'pub-year-header';
        header.textContent = year;
        group.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'pub-list-ul';
        items.forEach(pub => {
            list.appendChild(createPublicationItem(pub));
        });

        group.appendChild(list);
        container.appendChild(group);
    });
}

function renderAllPublicationsPage(container, publications) {
    const filter = getPublicationFilter();
    const filterIndicator = document.getElementById('filter-indicator');

    let filtered = publications.slice();

    if (filter === 'first-author') {
        filtered = filtered.filter(pub => pub.isFirstAuthor === true);
        if (filterIndicator) {
            filterIndicator.textContent = '(First Author)';
        }
    } else if (filter === 'accepted') {
        filtered = filtered.filter(pub => String(pub.type || '').toLowerCase() === 'accepted');
        if (filterIndicator) {
            filterIndicator.textContent = '(Accepted)';
        }
    } else if (filterIndicator) {
        filterIndicator.textContent = '';
    }

    updateFilterButtons(filter);
    renderAllPublications(container, filtered);
}

function renderAllPublications(container, publications) {
    container.innerHTML = '';

    if (!publications.length) {
        container.innerHTML = '<p class="empty-state">No publications found for this filter.</p>';
        return;
    }

    const grouped = new Map();

    publications
        .slice()
        .sort(compareAllPublications)
        .forEach(pub => {
            const yearLabel = getYearLabel(pub);
            if (!grouped.has(yearLabel)) {
                grouped.set(yearLabel, []);
            }
            grouped.get(yearLabel).push(pub);
        });

    Array.from(grouped.entries()).forEach(([year, items]) => {
        const group = document.createElement('div');
        group.className = 'pub-year-group';

        const header = document.createElement('h3');
        header.className = 'pub-year-header';
        header.textContent = year;
        group.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'pub-list-ul';
        items.forEach(pub => {
            list.appendChild(createPublicationItem(pub));
        });

        group.appendChild(list);
        container.appendChild(group);
    });
}

function createPublicationItem(pub) {
    const item = document.createElement('li');
    item.className = 'pub-list-item with-thumbnail-expanded';

    const content = document.createElement('div');
    content.className = 'pub-content-wrapper';

    const line1 = document.createElement('div');
    line1.className = 'pub-line-1';

    const title = document.createElement('span');
    title.className = 'pub-title-text';
    title.textContent = pub.displayTitle || pub.title || 'Untitled Publication';
    line1.appendChild(title);
    content.appendChild(line1);

    const line2 = document.createElement('div');
    line2.className = 'pub-line-2';
    line2.innerHTML = pub.authors || '';
    content.appendChild(line2);

    const line3 = document.createElement('div');
    line3.className = 'pub-line-3';

    const venueFullName = getVenueFullName(pub.venue, pub.year);
    const venueShortName = getVenueShortName(pub.venue, pub.year);
    const venueText = venueFullName || pub.venue || 'Preprint';

    const venueNameSpan = document.createElement('span');
    const displayYear = pub.venueYear || pub.year || '';
    venueNameSpan.textContent = venueText + (displayYear ? ', ' + displayYear : '');
    line3.appendChild(venueNameSpan);

    if (pub.venueNote) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'pub-venue-note';
        noteSpan.textContent = pub.venueNote;
        line3.appendChild(noteSpan);
    }

    if (shouldShowVenueTag(pub.venue, venueFullName, venueShortName)) {
        const venueTag = document.createElement('span');
        venueTag.className = 'pub-venue-tag pub-venue-inline-tag';
        venueTag.textContent = venueShortName;

        const lowerVenue = venueShortName.toLowerCase();
        if (lowerVenue.includes('under review') || lowerVenue.includes('preprint') || lowerVenue.includes('arxiv')) {
            venueTag.classList.add('tag-under-review');
        } else {
            venueTag.classList.add('tag-conference');
        }

        line3.appendChild(venueTag);
    }

    const badgeText = getHighlightBadge(pub.highlight);
    if (badgeText) {
        const badge = document.createElement('span');
        badge.className = 'pub-badge-highlight';
        badge.textContent = badgeText;
        line3.appendChild(badge);
    }

    content.appendChild(line3);

    if (pub.tags && Array.isArray(pub.tags)) {
        const line4 = document.createElement('div');
        line4.className = 'pub-line-4';

        pub.tags.forEach(tag => {
            const label = tag.text === 'Paper' ? 'PDF' : (tag.text || 'Link');
            const usableLink = hasUsableLink(tag.link);

            const button = document.createElement(usableLink ? 'a' : 'span');
            button.className = 'pub-link-btn';
            button.textContent = label;

            if (usableLink) {
                button.href = normalizeAssetPath(tag.link);
                button.target = '_blank';
                button.rel = 'noopener noreferrer';
            } else {
                button.classList.add('is-placeholder');
                button.title = 'Replace "#" with a real link in data/publications.json';
            }

            line4.appendChild(button);
        });

        if (line4.children.length > 0) {
            content.appendChild(line4);
        }
    }

    item.appendChild(content);

    if (pub.thumbnail) {
        const thumbBox = document.createElement('div');
        thumbBox.className = 'pub-thumbnail-box';

        const thumbImg = document.createElement('img');
        const preferredThumbnail = getPreferredThumbnail(pub.thumbnail);
        thumbImg.src = preferredThumbnail.primary;
        thumbImg.alt = `${pub.title || 'Publication'} preview`;
        thumbImg.loading = 'lazy';
        thumbImg.onerror = function() {
            if (this.src !== preferredThumbnail.fallback) {
                this.onerror = null;
                this.src = preferredThumbnail.fallback;
            }
        };

        thumbBox.appendChild(thumbImg);
        item.appendChild(thumbBox);
    }

    return item;
}

function renderNewsItems(newsData, container) {
    container.innerHTML = '';

    newsData.forEach(newsItem => {
        const newsElement = document.createElement('div');
        newsElement.className = 'news-item';

        const dateElement = document.createElement('span');
        dateElement.className = 'news-date';
        dateElement.textContent = newsItem.date || '';

        const contentElement = document.createElement('div');
        contentElement.className = 'news-content';

        const textSpan = document.createElement('span');
        textSpan.innerHTML = '🎉 ' + (newsItem.content || '');
        contentElement.appendChild(textSpan);

        if (Array.isArray(newsItem.links)) {
            newsItem.links.forEach(link => {
                const space = document.createTextNode(' ');
                contentElement.appendChild(space);

                const anchor = document.createElement('a');
                anchor.href = normalizeAssetPath(link.url || '#');
                anchor.textContent = link.text || 'Link';
                if (shouldOpenInNewTab(anchor.getAttribute('href'))) {
                    anchor.target = '_blank';
                    anchor.rel = 'noopener noreferrer';
                }
                contentElement.appendChild(anchor);
            });
        }

        newsElement.appendChild(dateElement);
        newsElement.appendChild(contentElement);
        container.appendChild(newsElement);
    });
}

function renderHonorsItems(honorsData, container) {
    container.innerHTML = '';

    honorsData.forEach(honorItem => {
        const honorElement = document.createElement('div');
        honorElement.className = 'honor-item';

        const yearElement = document.createElement('div');
        yearElement.className = 'honor-year';
        yearElement.textContent = honorItem.date || '';

        const contentElement = document.createElement('div');
        contentElement.className = 'honor-content';

        const titleElement = document.createElement('h3');
        titleElement.textContent = honorItem.title || '';
        contentElement.appendChild(titleElement);

        const descElement = document.createElement('p');
        if (honorItem.description) {
            descElement.innerHTML = honorItem.description;
        } else {
            descElement.textContent = honorItem.org || '';
        }
        contentElement.appendChild(descElement);

        honorElement.appendChild(yearElement);
        honorElement.appendChild(contentElement);
        container.appendChild(honorElement);
    });
}

function compareFeaturedPublications(a, b) {
    const orderA = a.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
        return orderA - orderB;
    }
    return compareAllPublications(a, b);
}

function compareAllPublications(a, b) {
    const yearA = getComparableYear(a);
    const yearB = getComparableYear(b);
    if (yearA !== yearB) {
        return yearB - yearA;
    }

    const acceptedA = String(a.type || '').toLowerCase() === 'accepted' ? 1 : 0;
    const acceptedB = String(b.type || '').toLowerCase() === 'accepted' ? 1 : 0;
    if (acceptedA !== acceptedB) {
        return acceptedB - acceptedA;
    }

    const orderA = a.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.featuredOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
        return orderA - orderB;
    }

    return String(a.title || '').localeCompare(String(b.title || ''));
}

function getComparableYear(pub) {
    const parsedYear = parseInt(pub.year, 10);
    if (!Number.isNaN(parsedYear)) {
        return parsedYear;
    }
    return String(pub.type || '').toLowerCase() === 'accepted' ? 0 : 9999;
}

function getYearLabel(pub) {
    const parsedYear = parseInt(pub.year, 10);
    if (!Number.isNaN(parsedYear)) {
        return String(parsedYear);
    }
    return 'Preprints / Under Review';
}

function getPublicationFilter() {
    const params = new URLSearchParams(window.location.search);
    return params.get('filter') || 'all';
}

function updateFilterButtons(filter) {
    document.querySelectorAll('.filter-link').forEach(link => {
        link.classList.remove('active');
    });

    if (filter === 'first-author') {
        const element = document.getElementById('filter-first');
        if (element) {
            element.classList.add('active');
        }
    } else if (filter === 'accepted') {
        const element = document.getElementById('filter-accepted');
        if (element) {
            element.classList.add('active');
        }
    } else {
        const element = document.getElementById('filter-all');
        if (element) {
            element.classList.add('active');
        }
    }
}

function getHighlightBadge(highlightText) {
    const text = String(highlightText || '').toLowerCase();
    if (text.includes('oral')) {
        return 'Oral';
    }
    if (text.includes('spotlight')) {
        return 'Spotlight';
    }
    if (text.includes('book')) {
        return 'Book';
    }
    if (text.includes('new')) {
        return 'New';
    }
    return '';
}

function getPreferredThumbnail(thumbnailPath) {
    const lastSlash = thumbnailPath.lastIndexOf('/');
    if (lastSlash === -1) {
        const normalized = normalizeAssetPath(thumbnailPath);
        return { primary: normalized, fallback: normalized };
    }

    const directory = thumbnailPath.substring(0, lastSlash);
    return {
        primary: normalizeAssetPath(`${directory}/demo.gif`),
        fallback: normalizeAssetPath(thumbnailPath)
    };
}

function getVenueShortName(venueStr, year) {
    if (!venueStr) {
        return 'Preprint';
    }

    let revisionSuffix = '';
    if (venueStr.toLowerCase().includes('major revision')) {
        revisionSuffix = ', Major';
    } else if (venueStr.toLowerCase().includes('minor revision')) {
        revisionSuffix = ', Minor';
    }

    let s = venueStr.replace(/\d{4}/g, '').trim();
    let suffix = '';

    const conferences = ['NeurIPS', 'ICML', 'CVPR', 'ICCV', 'ECCV', 'ICRA', 'AAAI', 'GLOBECOM', 'INFOCOM', 'MOBICOM', 'WHISPERS', 'ICCPR'];
    for (const conf of conferences) {
        if (s.includes(conf)) {
            if (year) {
                const yearStr = String(year);
                if (yearStr.length === 4) {
                    suffix = "'" + yearStr.substring(2);
                }
            }
            return conf + suffix + revisionSuffix;
        }
    }

    if (s.toLowerCase().includes('arxiv')) {
        return 'ArXiv' + revisionSuffix;
    }

    if (s.includes('TDSC')) return 'IEEE TDSC' + revisionSuffix;
    if (s.includes('TMC')) return 'IEEE TMC' + revisionSuffix;
    if (s.includes('JSAC')) return 'IEEE JSAC' + revisionSuffix;
    if (s.includes('TGCN')) return 'IEEE TGCN' + revisionSuffix;
    if (s.includes('LNET')) return 'IEEE LNET' + revisionSuffix;
    if (s.includes('TNSE')) return 'IEEE TNSE' + revisionSuffix;
    if (s.includes('IOTJ') || s.includes('IoTJ')) return 'IEEE IoTJ' + revisionSuffix;
    if (s.includes('TGRS') || (s.includes('Geoscience') && s.includes('Remote Sensing'))) return 'IEEE TGRS' + revisionSuffix;
    if (s.includes('Geodesy') && s.includes('Geoinformation')) return 'JGSIS' + revisionSuffix;
    if (s.includes('Geodaetica') || s.includes('测绘学报')) return '测绘学报' + revisionSuffix;
    if (s.includes('Instrumentation') && s.includes('Measurement')) return 'IEEE TIM' + revisionSuffix;
    if (s.includes('Selected Topics') && s.includes('Applied Earth')) return 'IEEE JSTARS' + revisionSuffix;
    if (s.includes('WHISPERS')) return 'WHISPERS' + revisionSuffix;
    if (s.includes('International Journal of Remote Sensing')) return 'IJRS' + revisionSuffix;
    if (s.includes('ICCPR')) return 'ICCPR' + revisionSuffix;

    return s || 'Preprint';
}

function getVenueFullName(venueStr) {
    if (!venueStr) {
        return '';
    }

    const s = venueStr.replace(/\d{4}/g, '').trim();

    if (s.includes('TDSC')) return 'IEEE Transactions on Dependable and Secure Computing';
    if (s.includes('TMC')) return 'IEEE Transactions on Mobile Computing';
    if (s.includes('JSAC')) return 'IEEE Journal on Selected Areas in Communications';
    if (s.includes('TGCN')) return 'IEEE Transactions on Green Communications and Networking';
    if (s.includes('TNSE')) return 'IEEE Transactions on Network Science and Engineering';
    if (s.includes('IoTJ') || s.includes('IOTJ')) return 'IEEE Internet of Things Journal';
    if (s.includes('LNET') || s.includes('LNet')) return 'IEEE Networking Letters';

    if (s.includes('NeurIPS')) return 'Annual Conference on Neural Information Processing Systems';
    if (s.includes('ICML')) return 'International Conference on Machine Learning';
    if (s.includes('CVPR')) return 'IEEE/CVF Conference on Computer Vision and Pattern Recognition';
    if (s.includes('ICCV')) return 'IEEE/CVF International Conference on Computer Vision';
    if (s.includes('ECCV')) return 'European Conference on Computer Vision';
    if (s.includes('ICRA')) return 'IEEE International Conference on Robotics and Automation';
    if (s.includes('AAAI')) return 'AAAI Conference on Artificial Intelligence';
    if (s.includes('GLOBECOM')) return 'IEEE Global Communications Conference';
    if (s.includes('INFOCOM')) return 'IEEE International Conference on Computer Communications';
    if (s.includes('MOBICOM')) return 'Annual International Conference on Mobile Computing and Networking';

    if (s.toLowerCase().includes('arxiv')) return 'arXiv preprint';
    if (s.includes('TGRS')) return 'IEEE Transactions on Geoscience and Remote Sensing';
    if (s.includes('Geodesy') && s.includes('Geoinformation')) return 'Journal of Geodesy and Geoinformation Science';
    if (s.includes('Geodaetica') || s.includes('测绘学报')) return '测绘学报 (Acta Geodaetica et Cartographica Sinica)';
    if (s.includes('Instrumentation') && s.includes('Measurement')) return 'IEEE Transactions on Instrumentation and Measurement';
    if (s.includes('Selected Topics') && s.includes('Applied Earth')) return 'IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing';
    if (s.includes('WHISPERS')) return 'Workshop on Hyperspectral Imaging and Signal Processing: Evolution in Remote Sensing';
    if (s.includes('International Journal of Remote Sensing')) return 'International Journal of Remote Sensing';
    if (s.includes('ICCPR')) return 'International Conference on Computing and Pattern Recognition';

    return s;
}

function shouldShowVenueTag(venueStr, fullVenueName, venueShort) {
    if (!venueShort) {
        return false;
    }

    const shortLower = venueShort.toLowerCase().trim();
    const fullLower = String(fullVenueName || '').toLowerCase().trim();

    if (!fullLower || shortLower === fullLower) {
        return false;
    }

    if (venueStr && venueStr.toLowerCase().includes('under review')) {
        return false;
    }

    return true;
}

function getDataPath(fileName) {
    return window.location.pathname.includes('/pages/') ? `../data/${fileName}` : `data/${fileName}`;
}

function normalizeAssetPath(path) {
    if (!path) {
        return path;
    }

    if (/^(https?:|mailto:|tel:|#)/i.test(path)) {
        return path;
    }

    if (window.location.pathname.includes('/pages/') && !path.startsWith('../')) {
        return `../${path}`;
    }

    return path;
}

function hasUsableLink(path) {
    return Boolean(path) && path !== '#';
}

function handleJsonResponse(response) {
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.text().then(text => JSON.parse(text));
}

function makeAllLinksOpenInNewTab() {
    document.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (shouldOpenInNewTab(href)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
}

function shouldOpenInNewTab(href) {
    if (!href) {
        return false;
    }
    if (href.startsWith('#')) {
        return false;
    }
    if (href.startsWith('../') || href.startsWith('./')) {
        return false;
    }
    if (/^[a-zA-Z]:\\/.test(href)) {
        return false;
    }
    if (href.endsWith('.html')) {
        return false;
    }
    return true;
}

function setupLinkObserver() {
    if (!document.body) {
        return;
    }

    const observer = new MutationObserver(mutations => {
        let shouldRefreshLinks = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRefreshLinks = true;
                break;
            }
        }

        if (shouldRefreshLinks) {
            makeAllLinksOpenInNewTab();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
