(function() {
  const AUTH_URL = "https://htvlibrary.netlify.app";

  async function initSupabaseClient() {
    try {
      const response = await fetch(AUTH_URL);
      if (!response.ok) {
        throw new Error("Не удалось получить ключ авторизации");
      }

      const { supabaseUrl, supabaseKey } = await response.json();

      const supabase = supabaseClient(supabaseUrl, supabaseKey);

      window.supabaseInstance = supabase;

      window.dispatchEvent(new CustomEvent("supabaseReady"));

      return supabase;
    } catch (error) {
      console.error("Ошибка инициализации Supabase:", error);
      throw error;
    }
  }

  function supabaseClient(supabaseUrl, supabaseKey) {
    return supabase.createClient(supabaseUrl, supabaseKey);
  }

  window.SupabaseAPI = {
    init: initSupabaseClient,

    // Метод ожидания готовности клиента
    onReady: function(callback) {
      if (window.supabaseInstance) {
        callback(window.supabaseInstance);
      } else {
        window.addEventListener("supabaseReady", () => {
          callback(window.supabaseInstance);
        });
      }
    },

    // Пример метода для получения данных
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

    // Добавьте другие методы по необходимости
  };

  // Автоматическая инициализация при загрузке страницы
  document.addEventListener("DOMContentLoaded", () => {
    window.SupabaseAPI.init().catch((err) => {
      console.error("Не удалось инициализировать Supabase:", err);
    });
  });
})();
