/**
 * reader.js
 * ---------------------------------------------------------------------------
 * Drives reader.html. All the actual Bible-text pages (book intros and
 * chapters) are loaded UNMODIFIED into <iframe id="bibleFrame">; this script
 * never reads or rewrites their HTML, it only:
 *   1. Picks the initial page to load, from the URL's ?book= (and optional
 *      &ch=) query params.
 *   2. Watches the iframe's 'load' event and keeps the sticky toolbar
 *      (title / chapter dropdown / prev-/next buttons) in sync with
 *      whatever page is currently showing -- including when the READER
 *      clicks one of the original page's own links and moves into a
 *      different chapter, or even a different book (the original pages'
 *      prev/next links cross book boundaries at the start/end of a book,
 *      e.g. Isaiah 1 <-> Song of Solomon 8).
 *   3. Auto-resizes the iframe to its content's height, so the browser's
 *      own scrollbar handles scrolling and the toolbar's `position: sticky`
 *      behaves correctly.
 *
 * URL shape:  reader.html?book=ISA        -> shows Isaiah's own intro page
 *             reader.html?book=ISA&ch=5   -> shows Isaiah chapter index 5
 *                                            (0-based into books.json's
 *                                            "chapters" array for that book)
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const requestedCode = (params.get('book') || '').toUpperCase();
  const requestedCh = params.get('ch');

  const toolbar = document.getElementById('readerToolbar');
  const toolbarTitle = document.getElementById('toolbarTitle');
  const chapterSelect = document.getElementById('chapterSelect');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const homeBtn = document.getElementById('homeBtn');
  const frame = document.getElementById('bibleFrame');
  const loadingMsg = document.getElementById('loadingMsg');

  // Populated once books.json loads.
  let bookByCode = {};        // code -> book object ({code,name,testament,intro,chapters})
  let fileIndex = {};         // lowercase chapter filename -> { code, index }
  let introIndex = {};        // lowercase intro filename -> code

  // Toolbar's current notion of "where we are"; kept in sync by resyncToolbar().
  let currentBook = null;
  let currentChapterIndex = -1;
  let lastPopulatedCode = null; // avoids rebuilding the <select> on every load

  homeBtn.addEventListener('click', () => { window.location.href = 'index.htm'; });

  fetch('books.json')
    .then(res => res.json())
    .then(data => {
      const allBooks = (data.books || []).concat(data.front || []);
      allBooks.forEach(book => {
        bookByCode[book.code] = book;
        introIndex[book.intro.toLowerCase()] = book.code;
        book.chapters.forEach((file, idx) => {
          fileIndex[file.toLowerCase()] = { code: book.code, index: idx };
        });
      });
      start();
    })
    .catch(err => {
      loadingMsg.textContent = 'Could not load books.json (' + (err.message || err) + ').';
      loadingMsg.classList.add('error-box');
    });

  function start() {
    const book = bookByCode[requestedCode];
    if (!book) {
      loadingMsg.textContent = 'Unknown book code "' + requestedCode + '". Return to the book list and choose a book.';
      loadingMsg.classList.add('error-box');
      return;
    }

    let initialFile = book.intro;
    const chIdx = parseInt(requestedCh, 10);
    if (!isNaN(chIdx) && book.chapters[chIdx]) {
      initialFile = book.chapters[chIdx];
    }

    setFrameSrc(initialFile);
  }

  function setFrameSrc(file) {
    frame.src = file;
  }

  frame.addEventListener('load', onFrameLoad);

  function onFrameLoad() {
    loadingMsg.style.display = 'none';
    frame.style.display = 'block';
    // Every iframe navigation -- whether triggered by our own toolbar
    // controls or by the reader clicking a link inside the page itself
    // (book title, prev/next arrows, a chapter number) -- can change the
    // outer page's total height (e.g. the sticky toolbar appearing/
    // disappearing, or the new page being a very different length). The
    // browser does NOT reset scroll position when that happens, so without
    // this the reader can be left scrolled into now-empty space, which
    // looks like a stray gap above the content. Reset to the top on every
    // load, matching normal page-to-page navigation behaviour.
    window.scrollTo({ top: 0, behavior: 'auto' });
    resizeFrame();
    // Fonts (the @font-face in gentiumplus.css) and images can reflow the
    // page slightly after the initial 'load' fires; re-measure shortly after.
    setTimeout(resizeFrame, 300);
    resyncToolbar();
    wireFootnoteLinks();
  }

  // The iframe is deliberately sized to its full content height (see
  // resizeFrame()) so that the OUTER page does all the scrolling, which is
  // what lets the sticky toolbar work. One side effect: the iframe has no
  // scrollable viewport of its own, so the pages' own same-page footnote
  // links (<a href="#FN1">, and the <a class="notebackref" href="#V24">
  // links back) can't scroll themselves into view -- there's nothing for
  // the iframe to scroll internally. This re-implements that same jump,
  // but scrolls the OUTER window to the target's real on-screen position
  // instead. Re-bound on every load since each navigation gets a fresh
  // contentDocument.
  function wireFootnoteLinks() {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch (e) {
      return; // cross-origin -- nothing we can do
    }
    if (!doc) return;

    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const target = doc.getElementById(id);
      if (!target) return; // unknown target -- leave default (no-op) behaviour

      e.preventDefault();

      // target's position within the iframe's own (unscrolled) document +
      // the iframe box's position within the outer window + how far the
      // outer window is already scrolled = target's true position in the
      // full outer document.
      const targetTop = target.getBoundingClientRect().top;
      const frameTop = frame.getBoundingClientRect().top;
      const toolbarHeight = toolbar.classList.contains('visible') ? toolbar.offsetHeight : 0;
      const destination = window.scrollY + frameTop + targetTop - toolbarHeight - 8; // 8px breathing room

      window.scrollTo({ top: Math.max(0, destination), behavior: 'smooth' });
    });
  }

  function resizeFrame() {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
      frame.style.height = h + 'px';
    } catch (e) {
      // Cross-origin (the reader followed an external link, e.g. eBible.org) --
      // can't measure or resync; leave the iframe's last known height/state.
    }
  }

  function basename(pathname) {
    const parts = pathname.split('/');
    return parts[parts.length - 1] || '';
  }

  function resyncToolbar() {
    let fname;
    try {
      fname = basename(frame.contentWindow.location.pathname).toLowerCase();
    } catch (e) {
      return; // cross-origin -- leave toolbar as it was
    }

    const chapterHit = fileIndex[fname];
    if (chapterHit) {
      currentBook = bookByCode[chapterHit.code];
      currentChapterIndex = chapterHit.index;
      showToolbarFor(currentBook, currentChapterIndex);
      updateUrl(currentBook.code, currentChapterIndex);
      return;
    }

    // Landed on a book's own intro/first page, or an unrelated page
    // (copyright.htm, webfaq.htm, ...): the sticky chapter selector only
    // applies while looking at an actual chapter, so hide it.
    toolbar.classList.remove('visible');
    const introCode = introIndex[fname];
    if (introCode) {
      currentBook = bookByCode[introCode];
      currentChapterIndex = -1;
      updateUrl(currentBook.code, null);
    }
  }

  function showToolbarFor(book, chapterIndex) {
    if (lastPopulatedCode !== book.code) {
      chapterSelect.innerHTML = book.chapters
        .map((file, idx) => `<option value="${idx}">${chapterLabel(book, idx)}</option>`)
        .join('');
      toolbarTitle.textContent = book.name;
      lastPopulatedCode = book.code;
    }
    chapterSelect.value = String(chapterIndex);
    prevBtn.disabled = chapterIndex <= 0;
    nextBtn.disabled = chapterIndex >= book.chapters.length - 1;
    toolbar.classList.add('visible');
  }

  // Turns e.g. "ISA01.htm" (code "ISA") into the label "1"; handles the
  // handful of books whose chapter numbering doesn't start at 1 (BAR, DAG
  // start at "00"; PSA runs "000".."150") by simply stripping leading
  // zeros from whatever numeral is actually in the filename -- no
  // assumptions are made about what that numeral means.
  //
  // A book can instead supply an explicit "chapterLabels" array in
  // books.json to override this (used for PS2 -- see the two entries
  // "PS200.htm"/"PS201.htm", which are an introduction page and the actual
  // Psalm 151 text respectively, not sequential chapters 0/1).
  function chapterLabel(book, idx) {
    if (Array.isArray(book.chapterLabels) && book.chapterLabels[idx] !== undefined) {
      return book.chapterLabels[idx];
    }
    const file = book.chapters[idx];
    const numeral = file.slice(book.code.length, -4); // strip code prefix + ".htm"
    return numeral.replace(/^0+(?=\d)/, '');
  }

  function updateUrl(code, chapterIndex) {
    const url = new URL(window.location.href);
    url.searchParams.set('book', code);
    if (chapterIndex === null || chapterIndex < 0) {
      url.searchParams.delete('ch');
    } else {
      url.searchParams.set('ch', String(chapterIndex));
    }
    history.replaceState(null, '', url);
  }

  chapterSelect.addEventListener('change', () => {
    if (!currentBook) return;
    const idx = parseInt(chapterSelect.value, 10);
    setFrameSrc(currentBook.chapters[idx]);
  });

  prevBtn.addEventListener('click', () => {
    if (!currentBook || currentChapterIndex <= 0) return;
    setFrameSrc(currentBook.chapters[currentChapterIndex - 1]);
  });

  nextBtn.addEventListener('click', () => {
    if (!currentBook || currentChapterIndex >= currentBook.chapters.length - 1) return;
    setFrameSrc(currentBook.chapters[currentChapterIndex + 1]);
  });

  // Re-measure on viewport changes (e.g. orientation change causing reflow).
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeFrame, 200);
  });
})();
