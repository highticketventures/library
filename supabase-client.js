(function() {
  const AUTH_URL =
    "https://htv-library.netlify.app/.netlify/functions/get-supabase-key";

  async function initSupabaseClient() {
    try {
      const response = await fetch(AUTH_URL);
      if (!response.ok) {
        throw new Error("Failed to obtain authorization key");
      }

      const { supabaseUrl, supabaseKey } = await response.json();

      const supabase = supabaseClient(supabaseUrl, supabaseKey);

      window.supabaseInstance = supabase;

      window.dispatchEvent(new CustomEvent("supabaseReady"));

      return supabase;
    } catch (error) {
      console.error("Error initializing Supabase:", error);
      throw error;
    }
  }

  function supabaseClient(supabaseUrl, supabaseKey) {
    return supabase.createClient(supabaseUrl, supabaseKey);
  }

  window.SupabaseAPI = {
    init: initSupabaseClient,

    onReady: function(callback) {
      if (window.supabaseInstance) {
        callback(window.supabaseInstance);
      } else {
        window.addEventListener("supabaseReady", () => {
          callback(window.supabaseInstance);
        });
      }
    },

    getItems: async function(table, options = {}) {
      return await this.onReady(async (supabase) => {
        let query = supabase.from(table).select(options.select || "*");

        if (options.orderBy) {
          query = query.order(options.orderBy, {
            ascending: options.ascending !== false,
          });
        }

        return await query;
      });
    },
  };
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
})();
console.log("SUPABASE CLIENT LOADED, AUTH_URL:", AUTH_URL);
