(function() {
  console.log("DOMContentLoaded CALLED");
  // === КОНСТАНТЫ И ПЕРЕМЕННЫЕ ===
  const LIKE_BLOCK_SELECTOR =
    ".idea-content_card-tags-likes-wrapper, .idea-content_card-tags-likes-wrapper-mobile";
  let adapter = null;
  const DEBUG = false;
  let currentSortMode = "recent-desc";

  window._debug_adapter = () => adapter;

  // === ВСПОМОГАТЕЛИ ===
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
    return window.supabaseInstance
      ? new SupabaseAdapter(window.supabaseInstance)
      : new LocalAdapter();
  }

  // === ЛАЙКИ НА СПИСКЕ КАРТОЧЕК ===
  async function initLikeButtons() {
    if (!adapter) adapter = createAdapter();
    document.querySelectorAll(LIKE_BLOCK_SELECTOR).forEach((wrapper) => {
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
        wrapper.classList.add("loading");

        const txtEl = wrapper.querySelector(
          ".idea-content_card-tags-likes-text-digit"
        );
        const old = parseInt(txtEl?.textContent || "0", 10);
        const was = wrapper.classList.contains("liked");

        try {
          // оптимистично обновляем UI
          wrapper.classList.toggle("liked", !was);
          safeSetText(txtEl, was ? old - 1 : old + 1);

          const { count, userLiked } = await adapter.toggleLike(cardId);

          wrapper.classList.toggle("liked", userLiked);
          safeSetText(txtEl, count);

          // если сейчас сортировка по популярности — обновляем порядок
          if (currentSortMode.startsWith("popular-")) {
            const list = document.querySelector('[fs-cmssort-element="list"]');
            if (list) sortItems(list, currentSortMode);
          }
        } catch (err) {
          debug("toggleLike failed:", err);
          // откатываем
          wrapper.classList.toggle("liked", was);
          safeSetText(txtEl, old);
        } finally {
          wrapper.classList.remove("loading");
        }
      });
    });
  }

  // === ОБНОВЛЕНИЕ СПИСКА КАРТОЧЕК ===
  async function refreshListing() {
    if (!adapter) adapter = createAdapter();

    const items = Array.from(document.querySelectorAll(".w-dyn-item"));
    const ids = Array.from(
      new Set(
        items
          .map(
            (item) =>
              item
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

      // просмотры
      safeSetText(item.querySelector(".view-count"), viewsMap[id] || 0);

      // лайки
      item.querySelectorAll(LIKE_BLOCK_SELECTOR).forEach((wrap) => {
        wrap.classList.toggle("liked", !!userLikedMap[id]);
        safeSetText(
          wrap.querySelector(".idea-content_card-tags-likes-text-digit"),
          likesMap[id] || 0
        );
      });
    });

    initLikeButtons();
    waitForListAndSort(currentSortMode);
    document.dispatchEvent(new CustomEvent("fs-cmssort:load"));
  }

  // === ОБНОВЛЕНИЕ ДЕТАЛЬНОЙ СТРАНИЦЫ ===
  async function refreshDetail() {
    if (!adapter) adapter = createAdapter();

    const m = location.pathname
      .toLowerCase()
      .match(/^\/library\/([^\/]+?)\/?$/);
    if (!m) return false;
    const cardId = m[1];

    // просмотры
    const vc = await adapter.trackView(cardId);
    document
      .querySelectorAll(".view-count")
      .forEach((el) => safeSetText(el, vc));

    // лайки
    const { count, userLiked } = await adapter.loadLikes(cardId);
    document
      .querySelectorAll(`${LIKE_BLOCK_SELECTOR}[data-card-id="${cardId}"]`)
      .forEach((wrap) => {
        wrap.classList.toggle("liked", userLiked);
        safeSetText(
          wrap.querySelector(".idea-content_card-tags-likes-text-digit"),
          count
        );
      });

    return true;
  }

  // === НАВЕШИВАЕМ CLICK-ХЕНДЛЕРЫ НА ДЕТАЛЬНОЙ СТРАНИЦЕ ===
  function initDetailLikeView() {
    console.log("initDetailLikeView CALLED");
    const likeBlocks = document.querySelectorAll(LIKE_BLOCK_SELECTOR);
    const viewCount = document.querySelector(".view-count");
    if (!likeBlocks.length || !viewCount) return;

    const m = location.pathname
      .toLowerCase()
      .match(/^\/library\/([^\/]+?)\/?$/);
    if (!m) return;
    const cardId = m[1];

    if (!adapter) adapter = createAdapter();

    // Проставляем data-card-id для всех лайк-блоков
    likeBlocks.forEach((wrap) => {
      wrap.dataset.cardId = cardId;
    });

    // показываем просмотры (опционально обновляет ещё раз)
    adapter.trackView(cardId).then((vc) => {
      viewCount.textContent = vc;
    });

    likeBlocks.forEach((wrap) => {
      const digit = wrap.querySelector(
        ".idea-content_card-tags-likes-text-digit"
      );
      if (!digit) return;

      // показываем лайки
      adapter.loadLikes(cardId).then(({ count, userLiked }) => {
        digit.textContent = count;
        wrap.classList.toggle("liked", userLiked);
      });

      // если ещё не повесили клик
      if (!wrap.dataset.detailLikeInit) {
        wrap.dataset.detailLikeInit = "1";
        wrap.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (wrap.classList.contains("loading")) return;
          wrap.classList.add("loading");
          const was = wrap.classList.contains("liked");
          const old = parseInt(digit.textContent || "0", 10);
          try {
            wrap.classList.toggle("liked", !was);
            digit.textContent = was ? old - 1 : old + 1;
            const { count, userLiked } = await adapter.toggleLike(cardId);
            wrap.classList.toggle("liked", userLiked);
            digit.textContent = count;
          } catch (err) {
            wrap.classList.toggle("liked", was);
            digit.textContent = old;
          } finally {
            wrap.classList.remove("loading");
          }
        });
      }
    });
  }

  // === СОРТИРОВКА ===
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
          label.textContent = (
            trigger.querySelector("div")?.textContent || trigger.textContent
          ).trim();
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
      const m = str.match(/^([A-Za-z]+) (\\d{1,2}), (\\d{4})$/);
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
        return toSortableDate(
          item.querySelector('[fs-cmssort-field="recent"]')?.textContent || ""
        );
      }
      return 0;
    }

    const prevOrder = items
      .map(
        (i) =>
          i.querySelector('a[href*="/library/"]')?.href.split("/library/")[1] ||
          ""
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

    const newOrder = items
      .map(
        (i) =>
          i.querySelector('a[href*="/library/"]')?.href.split("/library/")[1] ||
          ""
      )
      .join(",");

    if (prevOrder === newOrder) return;
    items.forEach((i) => container.appendChild(i));
    document.dispatchEvent(
      new CustomEvent("custom-sort:sorted", { detail: { sortMode } })
    );
  }

  function waitForListAndSort(sortMode) {
    const tryFind = () => {
      const list = document.querySelector('[fs-cmssort-element="list"]');
      if (list) sortItems(list, sortMode);
      else setTimeout(tryFind, 100);
    };
    tryFind();
  }

  // === ПЕРИОДИЧЕСКИЕ ОБНОВЛЕНИЯ, ЛИСТЕНЕРЫ И ОБСЕРВЕРЫ ===
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

  // === АДАПТЕРЫ ===
  class SupabaseAdapter {
    constructor(supabase) {
      this.supabase = supabase;
      try {
        this._likesCache =
          JSON.parse(localStorage.getItem("likes_cache")) || {};
      } catch {
        this._likesCache = {};
      }
    }
    getUserId() {
      let uid = localStorage.getItem("user_id");
      if (!uid) {
        uid =
          "user_" +
          Math.random()
            .toString(36)
            .substr(2, 9);
        localStorage.setItem("user_id", uid);
      }
      return uid;
    }
    async trackView(cardId) {
      const key = "viewedCards";
      let seen = {};
      try {
        seen = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        localStorage.setItem(key, "{}");
      }
      if (seen[cardId]) {
        const { data } = await this.supabase
          .from("page_views")
          .select("views")
          .eq("card_id", cardId)
          .single();
        return data?.views || 0;
      }
      seen[cardId] = true;
      localStorage.setItem(key, JSON.stringify(seen));
      const { data, error } = await this.supabase
        .from("page_views")
        .select("views")
        .eq("card_id", cardId)
        .single();
      const newCnt = !error && data ? data.views + 1 : 1;
      await this.supabase.from("page_views").upsert(
        { card_id: cardId, views: newCnt },
        {
          onConflict: "card_id",
        }
      );
      return newCnt;
    }
    async loadLikes(cardId) {
      const userId = this.getUserId();
      const res = await this.supabase
        .from("card_likes")
        .select("user_id", { count: "exact" })
        .eq("card_id", cardId);
      const count = res.count || 0;
      const userLiked = (res.data || []).some((r) => r.user_id === userId);
      this._likesCache[cardId] = { count, userLiked };
      try {
        localStorage.setItem("likes_cache", JSON.stringify(this._likesCache));
      } catch {}
      return { count, userLiked };
    }
    async loadAllStats() {
      const userId = this.getUserId();
      const [likeRes, viewRes] = await Promise.all([
        this.supabase.from("card_likes").select("card_id,user_id"),
        this.supabase.from("page_views").select("card_id,views"),
      ]);
      const likesMap = {},
        userLikedMap = {},
        viewsMap = {};
      (likeRes.data || []).forEach((r) => {
        likesMap[r.card_id] = (likesMap[r.card_id] || 0) + 1;
        if (r.user_id === userId) userLikedMap[r.card_id] = true;
      });
      (viewRes.data || []).forEach((r) => {
        viewsMap[r.card_id] = r.views;
      });
      return { likesMap, userLikedMap, viewsMap };
    }
    async loadStatsForList(cardIds = []) {
      if (!cardIds.length)
        return { likesMap: {}, userLikedMap: {}, viewsMap: {} };
      const userId = this.getUserId();
      const [likeRes, viewRes] = await Promise.all([
        this.supabase
          .from("card_likes")
          .select("card_id,user_id")
          .in("card_id", cardIds),
        this.supabase
          .from("page_views")
          .select("card_id,views")
          .in("card_id", cardIds),
      ]);
      const likesMap = {},
        userLikedMap = {},
        viewsMap = {};
      (likeRes.data || []).forEach((r) => {
        likesMap[r.card_id] = (likesMap[r.card_id] || 0) + 1;
        if (r.user_id === userId) userLikedMap[r.card_id] = true;
      });
      (viewRes.data || []).forEach((r) => {
        viewsMap[r.card_id] = r.views;
      });
      return { likesMap, userLikedMap, viewsMap };
    }
    async toggleLike(cardId) {
      const userId = this.getUserId();
      const { data, error } = await this.supabase.rpc("toggle_card_like", {
        p_card_id: cardId,
        p_user_id: userId,
      });
      if (error) throw error;
      this._likesCache[cardId] = {
        count: data.likes_count,
        userLiked: data.user_liked,
      };
      try {
        localStorage.setItem("likes_cache", JSON.stringify(this._likesCache));
      } catch {}
      return { count: data.likes_count, userLiked: data.user_liked };
    }
  }

  class LocalAdapter {
    constructor() {
      this._likesKey = "card_likes";
      this._viewsKey = "page_views";
      this._seenKey = "viewedCards";
    }
    getUserId() {
      let uid = localStorage.getItem("user_id");
      if (!uid) {
        uid =
          "user_" +
          Math.random()
            .toString(36)
            .substr(2, 9);
        localStorage.setItem("user_id", uid);
      }
      return uid;
    }
    async trackView(cardId) {
      let seen = {};
      try {
        seen = JSON.parse(localStorage.getItem(this._seenKey) || "{}");
      } catch {
        localStorage.setItem(this._seenKey, "{}");
      }
      if (seen[cardId]) {
        const now = JSON.parse(localStorage.getItem(this._viewsKey) || "{}");
        return now[cardId] || 0;
      }
      seen[cardId] = true;
      localStorage.setItem(this._seenKey, JSON.stringify(seen));
      const views = JSON.parse(localStorage.getItem(this._viewsKey) || "{}");
      views[cardId] = (views[cardId] || 0) + 1;
      localStorage.setItem(this._viewsKey, JSON.stringify(views));
      return views[cardId];
    }
    async loadLikes(cardId) {
      const likes = JSON.parse(localStorage.getItem(this._likesKey) || "{}");
      const uid = this.getUserId();
      const arr = likes[cardId] || [];
      return { count: arr.length, userLiked: arr.includes(uid) };
    }
    async loadAllStats() {
      const likes = JSON.parse(localStorage.getItem(this._likesKey) || "{}");
      const views = JSON.parse(localStorage.getItem(this._viewsKey) || "{}");
      const uid = this.getUserId();
      const likesMap = {},
        userLikedMap = {},
        viewsMap = {};
      Object.entries(likes).forEach(([cid, arr]) => {
        likesMap[cid] = arr.length;
        if (arr.includes(uid)) userLikedMap[cid] = true;
      });
      Object.assign(viewsMap, views);
      return { likesMap, userLikedMap, viewsMap };
    }
    async loadStatsForList(cardIds = []) {
      const likesMap = {},
        userLikedMap = {},
        viewsMap = {};
      const likes = JSON.parse(localStorage.getItem(this._likesKey) || "{}");
      const views = JSON.parse(localStorage.getItem(this._viewsKey) || "{}");
      const uid = this.getUserId();
      cardIds.forEach((cid) => {
        const arr = likes[cid] || [];
        likesMap[cid] = arr.length;
        if (arr.includes(uid)) userLikedMap[cid] = true;
        viewsMap[cid] = views[cid] || 0;
      });
      return { likesMap, userLikedMap, viewsMap };
    }
    async toggleLike(cardId) {
      const likes = JSON.parse(localStorage.getItem(this._likesKey) || "{}");
      const uid = this.getUserId();
      const arr = likes[cardId] || [];
      const idx = arr.indexOf(uid);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(uid);
      likes[cardId] = arr;
      localStorage.setItem(this._likesKey, JSON.stringify(likes));
      return { count: arr.length, userLiked: arr.includes(uid) };
    }
  }

  // === ОБЩИЙ РОУТЕР ===
  async function handleRouteChange() {
    const isDetail = await refreshDetail();
    if (isDetail) initDetailLikeView();
    else refreshListing();
  }

  // Перехват History API
  (function() {
    const evt = new Event("locationchange");
    const orig = history.pushState;
    history.pushState = function() {
      const ret = orig.apply(this, arguments);
      window.dispatchEvent(evt);
      return ret;
    };
    window.addEventListener("popstate", () => window.dispatchEvent(evt));
    window.addEventListener("locationchange", handleRouteChange);
  })();

  function waitForDetailLikeBlocksAndInit() {
    if (!/^\/library\/[^\/]+\/?$/.test(location.pathname.toLowerCase())) return;
    const observer = new MutationObserver(() => {
      const likeBlocks = document.querySelectorAll(LIKE_BLOCK_SELECTOR);
      if (likeBlocks.length) {
        console.log("LIKE_BLOCKS FOUND, CALLING initDetailLikeView");
        observer.disconnect();
        initDetailLikeView();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // На случай если лайк-блоки уже есть
    if (document.querySelectorAll(LIKE_BLOCK_SELECTOR).length) {
      console.log("LIKE_BLOCKS FOUND IMMEDIATELY, CALLING initDetailLikeView");
      observer.disconnect();
      initDetailLikeView();
    }
  }

  // Первая инициализация
  document.addEventListener("DOMContentLoaded", async () => {
    waitForDetailLikeBlocksAndInit();
    const debouncedListRefresh = debounce(refreshListing, 300);
    await handleRouteChange();
    setupCustomSort();
    setupPeriodicUpdates(debouncedListRefresh);
    setupEventListeners(debouncedListRefresh);
    setupMutationObservers(debouncedListRefresh);
  });

  // Экспорт для консоли/доп. вызовов
  window.refreshListing = refreshListing;
  window.refreshDetail = refreshDetail;
  window.initLikeButtons = initLikeButtons;
  window.initDetailLikeView = initDetailLikeView;
  window.SupabaseAdapter = SupabaseAdapter;
  window.LocalAdapter = LocalAdapter;
  window.LIKE_BLOCK_SELECTOR = LIKE_BLOCK_SELECTOR;
})();
