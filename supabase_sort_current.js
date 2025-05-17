// --- Глобальные функции для лайков (САМОЕ ВЕРХНЕЕ место файла) ---
const LIKE_BLOCK_SELECTOR =
  ".idea-content_card-tags-likes-wrapper, .idea-content_card-tags-likes-wrapper-mobile";

function initDetailLikeView() {
  const likeBlocks = document.querySelectorAll(LIKE_BLOCK_SELECTOR);
  if (!likeBlocks.length) return;

  const viewCount = document.querySelector(".view-count");
  if (!viewCount) return;

  const m = location.pathname.toLowerCase().match(/^\/library\/([^\/]+?)\/?$/);
  if (!m) return;
  const cardId = m[1];

  let adapter = window.adapter;
  if (!adapter) {
    if (window.supabaseInstance) {
      adapter = new SupabaseAdapter(window.supabaseInstance);
    } else {
      adapter = new LocalAdapter();
    }
    window.adapter = adapter;
  }

  adapter.trackView(cardId).then((vc) => {
    viewCount.textContent = vc;
  });

  likeBlocks.forEach((likeWrap) => {
    const likeDigit = likeWrap.querySelector(
      ".idea-content_card-tags-likes-text-digit"
    );
    if (!likeDigit) return;

    adapter.loadLikes(cardId).then(({ count, userLiked }) => {
      likeDigit.textContent = count;
      likeWrap.classList.toggle("liked", userLiked);
    });

    function likeClickHandler(e) {
      e.preventDefault();
      e.stopPropagation();
      if (likeWrap.classList.contains("loading")) return;
      likeWrap.classList.add("loading");
      const was = likeWrap.classList.contains("liked");
      let old = parseInt(likeDigit.textContent || "0", 10);
      try {
        likeWrap.classList.toggle("liked", !was);
        likeDigit.textContent = was ? old - 1 : old + 1;
        adapter
          .toggleLike(cardId)
          .then(({ count, userLiked }) => {
            likeWrap.classList.toggle("liked", userLiked);
            likeDigit.textContent = count;
          })
          .catch(() => {
            likeWrap.classList.toggle("liked", was);
            likeDigit.textContent = old;
          })
          .finally(() => {
            likeWrap.classList.remove("loading");
          });
      } catch (err) {
        likeWrap.classList.toggle("liked", was);
        likeDigit.textContent = old;
        likeWrap.classList.remove("loading");
      }
    }
    likeWrap.removeEventListener("click", likeClickHandler);
    likeWrap.addEventListener("click", likeClickHandler);
  });
}

function safeInitDetailLikeView() {
  const likeBlocks = document.querySelectorAll(LIKE_BLOCK_SELECTOR);
  const viewCount = document.querySelector(".view-count");
  if (!likeBlocks.length || !viewCount) {
    setTimeout(safeInitDetailLikeView, 200);
    return;
  }
  initDetailLikeView();
}

(function() {
  let adapter = null;
  const DEBUG = false;
  let currentSortMode = "recent-desc";

  window._debug_adapter = () => adapter;

  function debug(...args) {
    if (DEBUG) console.log("[card-stats]", ...args);
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function safeSetText(el, text) {
    if (!el) return;
    const s = String(text);
    if (el.textContent !== s) el.textContent = s;
  }

  function createAdapter() {
    if (window.supabaseInstance) {
      return new SupabaseAdapter(window.supabaseInstance);
    }
    return new LocalAdapter();
  }

  async function initLikeButtons() {
    if (!adapter) adapter = createAdapter();
    document
      .querySelectorAll(
        ".idea-content_card-tags-likes-wrapper, .idea-content_card-tags-likes-wrapper-mobile"
      )
      .forEach((wrapper) => {
        if (wrapper.dataset.likeInit) return;
        wrapper.dataset.likeInit = "1";
        const href =
          wrapper.closest(".w-dyn-item")?.querySelector('a[href*="/library/"]')
            ?.href || "";
        const cardId = href.split("/library/")[1] || "";
        if (!cardId) return;
        wrapper.dataset.cardId = cardId;

        wrapper.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (wrapper.classList.contains("loading")) return;

          const txtEl = wrapper.querySelector(
            ".idea-content_card-tags-likes-text-digit"
          );
          const old = parseInt(txtEl?.textContent || "0", 10);
          const was = wrapper.classList.contains("liked");
          wrapper.classList.add("loading");

          try {
            wrapper.classList.toggle("liked", !was);
            safeSetText(txtEl, was ? old - 1 : old + 1);

            const { count, userLiked } = await adapter.toggleLike(cardId);

            wrapper.classList.toggle("liked", userLiked);
            safeSetText(txtEl, count);

            if (currentSortMode.startsWith("popular-")) {
              const list = document.querySelector(
                '[fs-cmssort-element="list"]'
              );
              if (list) sortItems(list, currentSortMode);
            }
          } catch (err) {
            debug("toggleLike failed:", err);
            wrapper.classList.toggle("liked", was);
            safeSetText(txtEl, old);
          } finally {
            wrapper.classList.remove("loading");
          }
        });
      });
  }

  async function refreshListing() {
    if (!adapter) adapter = createAdapter();

    const items = Array.from(document.querySelectorAll(".w-dyn-item"));
    const ids = Array.from(
      new Set(
        items
          .map(
            (it) =>
              it
                .querySelector('a[href*="/library/"]')
                ?.href.split("/library/")[1] || ""
          )
          .filter(Boolean)
      )
    );
    if (!ids.length) return;

    let stats;
    try {
      stats = await adapter.loadStatsForList(ids);
    } catch (err) {
      debug("partial stats failed, fallback to full:", err);
      stats = await adapter.loadAllStats();
    }

    const { likesMap, userLikedMap, viewsMap } = stats;

    items.forEach((item) => {
      const href = item.querySelector('a[href*="/library/"]')?.href || "";
      const id = href.split("/library/")[1] || "";

      const vEl = item.querySelector(".view-count");
      safeSetText(vEl, viewsMap[id] || 0);

      // Новый универсальный обработчик для всех лайковых блоков
      const likeBlocks = item.querySelectorAll(
        ".idea-content_card-tags-likes-wrapper, .idea-content_card-tags-likes-wrapper-mobile"
      );
      likeBlocks.forEach((wrap) => {
        wrap.classList.toggle("liked", !!userLikedMap[id]);
        const txt = wrap.querySelector(
          ".idea-content_card-tags-likes-text-digit"
        );
        safeSetText(txt, likesMap[id] || 0);
      });
    });

    initLikeButtons();

    waitForListAndSort(currentSortMode);

    document.dispatchEvent(new CustomEvent("fs-cmssort:load"));
  }

  async function refreshDetail() {
    if (!adapter) adapter = createAdapter();

    const m = location.pathname
      .toLowerCase()
      .match(/^\/library\/([^\/]+?)\/?$/);
    if (!m) return false;

    const cardId = m[1];
    const vc = await adapter.trackView(cardId);
    document
      .querySelectorAll(".view-count")
      .forEach((el) => safeSetText(el, vc));

    const { count, userLiked } = await adapter.loadLikes(cardId);

    // Обновляем оба блока: десктопный и мобильный
    document
      .querySelectorAll(
        '.idea-content_card-tags-likes-wrapper[data-card-id="' +
          cardId +
          '"], .idea-content_card-tags-likes-wrapper-mobile[data-card-id="' +
          cardId +
          '"]'
      )
      .forEach((wrap) => {
        wrap.classList.toggle("liked", userLiked);
        const txt = wrap.querySelector(
          ".idea-content_card-tags-likes-text-digit"
        );
        safeSetText(txt, count);
      });

    return true;
  }

  function setupCustomSort() {
    const triggerContainer = document.querySelector(
      '[fs-cmssort-element="trigger"]'
    );
    if (!triggerContainer) return;

    const sortTriggers = Array.from(
      triggerContainer.querySelectorAll("[fs-cmssort-field]")
    ).filter((el) => {
      const sf = el.getAttribute("fs-cmssort-field") || "";
      return (
        sf.startsWith("viewing-") ||
        sf.startsWith("popular-") ||
        sf.startsWith("recent-")
      );
    });

    sortTriggers.forEach((trigger) => {
      trigger.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const sf = trigger.getAttribute("fs-cmssort-field");
        if (!sf) return;

        currentSortMode = sf;
        waitForListAndSort(sf);

        const label = document.querySelector(
          '[fs-cmssort-element="dropdown-label"]'
        );
        if (label) {
          const linkText =
            trigger.querySelector("div")?.textContent || trigger.textContent;
          label.textContent = linkText.trim();
        }

        sortTriggers.forEach((el) =>
          el.classList.toggle("w--current", el === trigger)
        );
      });
    });
  }

  function sortItems(container, sortMode) {
    const items = Array.from(container.querySelectorAll(".w-dyn-item"));
    if (!items.length) return;

    const [field, order = "desc"] = sortMode.split("-");

    function toSortableDate(str) {
      const months = {
        January: "01",
        February: "02",
        March: "03",
        April: "04",
        May: "05",
        June: "06",
        July: "07",
        August: "08",
        September: "09",
        October: "10",
        November: "11",
        December: "12",
      };
      const m = str.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
      if (!m) return "";
      return `${m[3]}-${months[m[1]]}-${m[2].padStart(2, "0")}`;
    }

    function getValue(item) {
      if (field === "viewing") {
        return parseInt(
          item.querySelector('[fs-cmssort-field="viewing"]')?.textContent ||
            "0",
          10
        );
      }
      if (field === "popular") {
        return parseInt(
          item.querySelector('[fs-cmssort-field="popular"]')?.textContent ||
            "0",
          10
        );
      }
      if (field === "recent") {
        const dateStr =
          item.querySelector('[fs-cmssort-field="recent"]')?.textContent || "";
        return toSortableDate(dateStr);
      }
      return 0;
    }

    // Получаем порядок id до сортировки
    const prevOrder = Array.from(container.children)
      .filter((el) => el.classList.contains("w-dyn-item"))
      .map(
        (el) =>
          el
            .querySelector('a[href*="/library/"]')
            ?.href.split("/library/")[1] || ""
      )
      .join(",");

    items.sort((a, b) => {
      const va = getValue(a),
        vb = getValue(b);
      if (field === "recent") {
        return order === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return order === "asc" ? va - vb : vb - va;
    });

    // Получаем порядок id после сортировки
    const newOrder = items
      .map(
        (el) =>
          el
            .querySelector('a[href*="/library/"]')
            ?.href.split("/library/")[1] || ""
      )
      .join(",");

    if (prevOrder === newOrder) return; // Если порядок не изменился — не обновляем DOM

    items.forEach((i) => container.appendChild(i));
    document.dispatchEvent(
      new CustomEvent("custom-sort:sorted", {
        detail: { sortMode },
      })
    );
  }

  function setupPeriodicUpdates(debouncedRefresh) {
    window._cardStatsInterval = setInterval(() => {
      const isDetail = !!location.pathname
        .toLowerCase()
        .match(/^\/library\/([^\/]+?)\/?$/);
      if (!isDetail) debouncedRefresh();
    }, 3000);
  }

  function setupEventListeners(debouncedRefresh) {
    [
      "fs-cmsload:loaded",
      "fs-cmssort:sorted",
      "fs-cmsfilter:filtered",
      "custom-sort:sorted",
    ].forEach((name) =>
      document.addEventListener(name, () => debouncedRefresh())
    );
    document.addEventListener("click", (e) => {
      if (
        e.target.closest(".w-pagination-next") ||
        e.target.closest(".w-pagination-previous") ||
        e.target.closest(".w-pagination-wrapper") ||
        e.target.closest("[role='navigation']")
      ) {
        debouncedRefresh();
      }
    });
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        debouncedRefresh();
      }
    }, 500);
  }

  function setupMutationObservers(debouncedRefresh) {
    const dynItems = document.querySelector(".w-dyn-items");
    if (dynItems) {
      new MutationObserver((muts) => {
        if (muts.some((m) => m.addedNodes.length)) debouncedRefresh();
      }).observe(dynItems, { childList: true, subtree: true });
    }
    const pag =
      document.querySelector(".w-pagination-wrapper") ||
      document.querySelector("[role='navigation']");
    if (pag) {
      new MutationObserver(() => debouncedRefresh()).observe(pag, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
    const cms =
      document.querySelector(".w-dyn-list") ||
      dynItems?.closest(".collection-list-wrapper");
    if (cms && cms !== dynItems) {
      new MutationObserver(() => debouncedRefresh()).observe(cms, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }

  function waitForListAndSort(sortMode) {
    const tryFind = () => {
      const list = document.querySelector('[fs-cmssort-element="list"]');
      if (list) {
        sortItems(list, sortMode);
      } else {
        setTimeout(tryFind, 100);
      }
    };
    tryFind();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const debouncedListRefresh = debounce(refreshListing, 300);
    (async function initPage() {
      const isDetail = await refreshDetail();
      if (!isDetail) refreshListing();
      setupCustomSort();
    })();
    setupPeriodicUpdates(debouncedListRefresh);
    setupEventListeners(debouncedListRefresh);
    setupMutationObservers(debouncedListRefresh);
  });

  window.sortItems = sortItems;
  window.setupCustomSort = setupCustomSort;
  window.refreshListing = refreshListing;
  window.refreshDetail = refreshDetail;
  window.initDetailLikeView = initDetailLikeView;
  window.safeInitDetailLikeView = safeInitDetailLikeView;
  window.SupabaseAdapter = SupabaseAdapter;
  window.LocalAdapter = LocalAdapter;
})();

// --- Универсальный SPA-роутер через History API ---
(function() {
  // Перехват pushState
  const origPush = history.pushState;
  history.pushState = function() {
    const ret = origPush.apply(this, arguments);
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  };
  // Перехват back/forward
  window.addEventListener("popstate", () =>
    window.dispatchEvent(new Event("locationchange"))
  );
})();

// На каждое изменение URL в SPA
async function onSpaNavigation() {
  const isDetail = await window.refreshDetail();
  if (isDetail) {
    safeInitDetailLikeView();
  } else {
    refreshListing();
  }
}

onSpaNavigation();
window.addEventListener("locationchange", onSpaNavigation);
