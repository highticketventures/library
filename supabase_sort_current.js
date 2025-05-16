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

      const wrap = item.querySelector(".idea-content_card-tags-likes-wrapper");
      if (wrap) {
        wrap.classList.toggle("liked", !!userLikedMap[id]);
        const txt = wrap.querySelector(
          ".idea-content_card-tags-likes-text-digit"
        );
        safeSetText(txt, likesMap[id] || 0);
      }
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
    const wrap = document.querySelector(
      `.idea-content_card-tags-likes-wrapper[data-card-id="${cardId}"]`
    );
    if (wrap) {
      wrap.classList.toggle("liked", userLiked);
      const txt = wrap.querySelector(
        ".idea-content_card-tags-likes-text-digit"
      );
      safeSetText(txt, count);
    }
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
      console.log("trackView cardId:", cardId);
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
      const upsertRes = await this.supabase
        .from("page_views")
        .upsert({ card_id: cardId, views: newCnt }, { onConflict: "card_id" });

      if (upsertRes.error) {
        console.error("Ошибка upsert page_views:", upsertRes.error);
      } else {
        console.log("Upsert page_views OK:", upsertRes);
      }
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

  window.sortItems = sortItems;
  window.setupCustomSort = setupCustomSort;
  window.refreshListing = refreshListing;

  window.SupabaseAdapter = SupabaseAdapter;
  window.LocalAdapter = LocalAdapter;
})();

// test change
document.addEventListener("DOMContentLoaded", () => {
  const debouncedListRefresh = debounce(refreshListing, 300);
  window.SupabaseAPI.onReady(async () => {
    const isDetail = await refreshDetail();
    if (!isDetail) refreshListing();
    setupCustomSort();
    setupPeriodicUpdates(debouncedListRefresh);
    setupEventListeners(debouncedListRefresh);
    setupMutationObservers(debouncedListRefresh);
  });
});

function initDetailLikeView() {
  const likeWrap = document.querySelector(
    ".idea-content_card-tags-likes-wrapper"
  );
  if (!likeWrap) return;

  const likeDigit = likeWrap.querySelector(
    ".idea-content_card-tags-likes-text-digit"
  );
  const viewCount = document.querySelector(".view-count");
  if (!likeDigit || !viewCount) return;

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

  adapter.loadLikes(cardId).then(({ count, userLiked }) => {
    console.log("loadLikes result", count, userLiked);
    likeDigit.textContent = count;
    likeWrap.classList.toggle("liked", userLiked);
  });

  function likeClickHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    if (likeWrap.classList.contains("loading")) return;
    likeWrap.classList.add("loading");
    const was = likeWrap.classList.contains("liked");
    const likeDigit = likeWrap.querySelector(
      ".idea-content_card-tags-likes-text-digit"
    );
    let old = parseInt(likeDigit.textContent || "0", 10);
    try {
      likeWrap.classList.toggle("liked", !was);
      likeDigit.textContent = was ? old - 1 : old + 1;
      adapter
        .toggleLike(cardId)
        .then(({ count, userLiked }) => {
          console.log("toggleLike result", count, userLiked);
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
}

function tryInitDetailLikeView() {
  if (document.querySelector(".idea-content_card-tags-likes-wrapper")) {
    initDetailLikeView();
  } else {
    setTimeout(tryInitDetailLikeView, 200);
  }
}

document.addEventListener("DOMContentLoaded", tryInitDetailLikeView);

function observeWebflowLikeBlock() {
  const cmsContainer = document.querySelector(
    ".ideainner-hero_key-likes-block"
  );
  const targetSelector = ".idea-content_card-tags-likes-wrapper";

  if (!cmsContainer) {
    setTimeout(observeWebflowLikeBlock, 200);
    return;
  }

  if (cmsContainer.querySelector(targetSelector)) {
    initDetailLikeView();
    return;
  }

  const observer = new MutationObserver(() => {
    if (cmsContainer.querySelector(targetSelector)) {
      initDetailLikeView();
      observer.disconnect();
    }
  });
  observer.observe(cmsContainer, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", observeWebflowLikeBlock);
